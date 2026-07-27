package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

var errUnsupportedChain = errors.New("unsupported chain")

const (
	weiPerGwei = 1_000_000_000

	defaultFloorPriority = 1_000_000 // 0.001 Gwei
	defaultCeilPriority  = 1_000_000_000 // 1 Gwei
	defaultCeilMaxFee    = 5_000_000_000 // 5 Gwei
	defaultCacheTTL      = 10 * time.Second
	defaultListen        = ":8787"
	defaultRPCTimeout    = 5 * time.Second
)

// Tier multipliers: maxFee = base*b + priority*m, priorityOut = priority*m
var tiers = []struct {
	name string
	m    float64 // priority multiplier
	b    float64 // base fee multiplier
}{
	{"slow", 1.0, 1.1},
	{"medium", 1.0, 1.2},
	{"fast", 2.0, 1.5},
	{"superFast", 4.0, 2.0},
}

type tierFee struct {
	SuggestedMaxPriorityFeePerGas string `json:"suggestedMaxPriorityFeePerGas"`
	SuggestedMaxFeePerGas         string `json:"suggestedMaxFeePerGas"`
	MinWaitTimeEstimate           int    `json:"minWaitTimeEstimate"`
	MaxWaitTimeEstimate           int    `json:"maxWaitTimeEstimate"`
}

type gasEstimate map[string]tierFee

type cacheEntry struct {
	body      []byte
	fetchedAt time.Time
}

type config struct {
	listen        string
	cacheTTL      time.Duration
	floorPriority *big.Int
	ceilPriority  *big.Int
	ceilMaxFee    *big.Int
	rpcs          map[int64]string
	fallback      []byte
}

type server struct {
	cfg    config
	client *http.Client
	mu     sync.RWMutex
	cache  map[int64]cacheEntry
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(runHealthcheck())
	}

	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	s := &server{
		cfg: cfg,
		client: &http.Client{
			Timeout: defaultRPCTimeout,
		},
		cache: make(map[int64]cacheEntry),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/", s.handleRoot)

	log.Printf("gas-provider listening on %s (chains=%v ttl=%s)",
		cfg.listen, chainIDs(cfg.rpcs), cfg.cacheTTL)
	if err := http.ListenAndServe(cfg.listen, mux); err != nil {
		log.Fatal(err)
	}
}

func runHealthcheck() int {
	addr := envOr("LISTEN_ADDR", defaultListen)
	host := addr
	if strings.HasPrefix(host, ":") {
		host = "127.0.0.1" + host
	}
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://" + host + "/health")
	if err != nil {
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

func loadConfig() (config, error) {
	fallbackPath := envOr("FALLBACK_PATH", "fallback.json")
	fallback, err := os.ReadFile(fallbackPath)
	if err != nil {
		return config{}, fmt.Errorf("read fallback %s: %w", fallbackPath, err)
	}
	if !json.Valid(fallback) {
		return config{}, fmt.Errorf("fallback %s is not valid JSON", fallbackPath)
	}

	rpcs := map[int64]string{}
	for _, e := range os.Environ() {
		if !strings.HasPrefix(e, "RPC_") {
			continue
		}
		parts := strings.SplitN(e, "=", 2)
		if len(parts) != 2 || parts[1] == "" {
			continue
		}
		idStr := strings.TrimPrefix(parts[0], "RPC_")
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return config{}, fmt.Errorf("invalid %s: %w", parts[0], err)
		}
		rpcs[id] = parts[1]
	}
	if len(rpcs) == 0 {
		return config{}, fmt.Errorf("no RPC_<chainId> env vars set")
	}

	ttlSec, err := strconv.Atoi(envOr("CACHE_TTL_SECONDS", "10"))
	if err != nil || ttlSec < 1 {
		return config{}, fmt.Errorf("CACHE_TTL_SECONDS must be >= 1")
	}

	floor, err := parseUintEnv("FLOOR_PRIORITY_WEI", defaultFloorPriority)
	if err != nil {
		return config{}, err
	}
	ceilP, err := parseUintEnv("CEIL_PRIORITY_WEI", defaultCeilPriority)
	if err != nil {
		return config{}, err
	}
	ceilM, err := parseUintEnv("CEIL_MAX_FEE_WEI", defaultCeilMaxFee)
	if err != nil {
		return config{}, err
	}

	return config{
		listen:        envOr("LISTEN_ADDR", defaultListen),
		cacheTTL:      time.Duration(ttlSec) * time.Second,
		floorPriority: floor,
		ceilPriority:  ceilP,
		ceilMaxFee:    ceilM,
		rpcs:          rpcs,
		fallback:      fallback,
	}, nil
}

func parseUintEnv(key string, def int64) (*big.Int, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return big.NewInt(def), nil
	}
	n, ok := new(big.Int).SetString(raw, 10)
	if !ok || n.Sign() < 0 {
		return nil, fmt.Errorf("%s must be a non-negative integer", key)
	}
	return n, nil
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func chainIDs(rpcs map[int64]string) []int64 {
	ids := make([]int64, 0, len(rpcs))
	for id := range rpcs {
		ids = append(ids, id)
	}
	return ids
}

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "text/plain")
	_, _ = w.Write([]byte("ok\n"))
}

func (s *server) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" || strings.Contains(path, "/") {
		http.NotFound(w, r)
		return
	}
	chainID, err := strconv.ParseInt(path, 10, 64)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	body, err := s.estimate(r.Context(), chainID)
	if errors.Is(err, errUnsupportedChain) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		log.Printf("chain %d: %v (serving fallback)", chainID, err)
		body = s.cfg.fallback
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(body)
}

func (s *server) estimate(ctx context.Context, chainID int64) ([]byte, error) {
	rpcURL, ok := s.cfg.rpcs[chainID]
	if !ok {
		return nil, fmt.Errorf("%w: %d", errUnsupportedChain, chainID)
	}

	s.mu.RLock()
	if ent, hit := s.cache[chainID]; hit && time.Since(ent.fetchedAt) < s.cfg.cacheTTL {
		body := ent.body
		s.mu.RUnlock()
		return body, nil
	}
	lastGood := s.cache[chainID]
	s.mu.RUnlock()

	body, err := s.fetchAndBuild(ctx, rpcURL)
	if err != nil {
		if lastGood.body != nil {
			log.Printf("chain %d: rpc error, serving last-good: %v", chainID, err)
			return lastGood.body, nil
		}
		return nil, err
	}

	s.mu.Lock()
	s.cache[chainID] = cacheEntry{body: body, fetchedAt: time.Now()}
	s.mu.Unlock()
	return body, nil
}

func (s *server) fetchAndBuild(ctx context.Context, rpcURL string) ([]byte, error) {
	baseWei, err := s.rpcBaseFee(ctx, rpcURL)
	if err != nil {
		return nil, fmt.Errorf("baseFee: %w", err)
	}
	priorityWei, err := s.rpcMaxPriorityFee(ctx, rpcURL)
	if err != nil {
		return nil, fmt.Errorf("priority: %w", err)
	}

	priorityWei = clampBig(priorityWei, s.cfg.floorPriority, s.cfg.ceilPriority)

	out := make(gasEstimate, len(tiers))
	for _, t := range tiers {
		prio := scaleBig(priorityWei, t.m)
		prio = clampBig(prio, s.cfg.floorPriority, s.cfg.ceilPriority)

		basePart := scaleBig(baseWei, t.b)
		maxFee := new(big.Int).Add(basePart, prio)
		if maxFee.Cmp(s.cfg.ceilMaxFee) > 0 {
			maxFee = new(big.Int).Set(s.cfg.ceilMaxFee)
		}
		// maxFee must be at least base + priority
		minMax := new(big.Int).Add(baseWei, prio)
		if maxFee.Cmp(minMax) < 0 {
			maxFee = minMax
		}

		out[t.name] = tierFee{
			SuggestedMaxPriorityFeePerGas: weiToGweiString(prio),
			SuggestedMaxFeePerGas:         weiToGweiString(maxFee),
			MinWaitTimeEstimate:           2,
			MaxWaitTimeEstimate:           30,
		}
	}

	return json.Marshal(out)
}

func scaleBig(n *big.Int, mult float64) *big.Int {
	// n * mult via float only for small Horizen fees; use big.Float for safety.
	f := new(big.Float).SetInt(n)
	f.Mul(f, big.NewFloat(mult))
	out, _ := f.Int(nil)
	if out.Sign() == 0 && n.Sign() > 0 && mult > 0 {
		return big.NewInt(1)
	}
	return out
}

func clampBig(n, lo, hi *big.Int) *big.Int {
	out := new(big.Int).Set(n)
	if out.Cmp(lo) < 0 {
		out.Set(lo)
	}
	if out.Cmp(hi) > 0 {
		out.Set(hi)
	}
	return out
}

func weiToGweiString(wei *big.Int) string {
	// Format as decimal Gwei without scientific notation; trim trailing zeros.
	f := new(big.Float).Quo(new(big.Float).SetInt(wei), big.NewFloat(weiPerGwei))
	s := f.Text('f', 18)
	s = strings.TrimRight(s, "0")
	s = strings.TrimRight(s, ".")
	if s == "" {
		return "0"
	}
	return s
}

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Method  string `json:"method"`
	Params  []any  `json:"params"`
}

type rpcResponse struct {
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func (s *server) rpcCall(ctx context.Context, rpcURL, method string, params []any) (json.RawMessage, error) {
	payload, err := json.Marshal(rpcRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  method,
		Params:  params,
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, rpcURL, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("http %d: %s", resp.StatusCode, truncate(body, 200))
	}
	var parsed rpcResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	if parsed.Error != nil {
		return nil, fmt.Errorf("rpc %d: %s", parsed.Error.Code, parsed.Error.Message)
	}
	return parsed.Result, nil
}

func (s *server) rpcBaseFee(ctx context.Context, rpcURL string) (*big.Int, error) {
	raw, err := s.rpcCall(ctx, rpcURL, "eth_getBlockByNumber", []any{"latest", false})
	if err != nil {
		return nil, err
	}
	var block struct {
		BaseFeePerGas string `json:"baseFeePerGas"`
	}
	if err := json.Unmarshal(raw, &block); err != nil {
		return nil, err
	}
	if block.BaseFeePerGas == "" {
		return nil, fmt.Errorf("missing baseFeePerGas")
	}
	return parseHexBig(block.BaseFeePerGas)
}

func (s *server) rpcMaxPriorityFee(ctx context.Context, rpcURL string) (*big.Int, error) {
	raw, err := s.rpcCall(ctx, rpcURL, "eth_maxPriorityFeePerGas", nil)
	if err != nil {
		return nil, err
	}
	var hexStr string
	if err := json.Unmarshal(raw, &hexStr); err != nil {
		return nil, err
	}
	return parseHexBig(hexStr)
}

func parseHexBig(hexStr string) (*big.Int, error) {
	hexStr = strings.TrimPrefix(strings.ToLower(hexStr), "0x")
	if hexStr == "" {
		return big.NewInt(0), nil
	}
	n, ok := new(big.Int).SetString(hexStr, 16)
	if !ok {
		return nil, fmt.Errorf("invalid hex: 0x%s", hexStr)
	}
	return n, nil
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
