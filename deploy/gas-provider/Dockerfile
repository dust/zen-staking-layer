# Dynamic CUSTOM gas provider for rrelayer (Horizen EIP-1559).
# golang:1.22-alpine already ships ca-certificates (no apk needed).
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY main.go ./
COPY fallback.json ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /gas-provider .

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /gas-provider /gas-provider
COPY --from=build /src/fallback.json /fallback.json
USER 10001:10001
EXPOSE 8787
ENV LISTEN_ADDR=:8787 \
    FALLBACK_PATH=/fallback.json \
    CACHE_TTL_SECONDS=10
ENTRYPOINT ["/gas-provider"]
