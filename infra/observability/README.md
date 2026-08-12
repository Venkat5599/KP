# Running noyeet locally

One compose stack and two Bun processes. Nothing here talks to a managed service.

## 1. Infrastructure

```bash
cd infra/observability
docker compose up -d
docker exec noyeet-redpanda rpk cluster health          # wait for Healthy: true
docker exec noyeet-redpanda rpk topic create \
  noyeet.decisions.v1 noyeet.anchors.v1 noyeet.dead-letter.v1 -p 3
```

| Service | URL | What it is for |
| --- | --- | --- |
| Prometheus | <http://localhost:9090> | Metrics, SLO recording rules, alert state |
| Grafana | <http://localhost:3001> | Dashboards, provisioned from files |
| Alertmanager | <http://localhost:9093> | Alert routing, grouping, inhibition |
| Redpanda Console | <http://localhost:8085> | Browse the decision topics |
| Tempo | <http://localhost:3200> | Trace storage |
| OTLP collector | localhost:4317 / 4318 | Where services send spans |
| Redpanda (Kafka API) | localhost:19092 | From the host |

## 2. Services

```bash
cp .env.example .env       # fill in KEEPERHUB_API_KEY
bun run --cwd apps/gateway start
bun run --cwd apps/anchor  start
```

## 3. Prove it works

```bash
curl -s localhost:8080/healthz
curl -s localhost:8080/readyz
curl -s localhost:8080/metrics | head

curl -s -X POST localhost:8080/authorize -H 'content-type: application/json' -d '{
  "id": "itn_demo_1",
  "chainId": 11155111,
  "calls": [{ "target": "0x000000000000000000000000000000000000dEaD", "value": "0", "data": "0x9d0bf2e9" }],
  "invariants": [{ "target": "0x2BeaFD2Ed0D8e3831752b3243E7C5b2CA67Fdb0B", "probe": "0xbf92857c", "word": 5, "op": "GTE", "threshold": "1400000000000000000" }]
}'
```

That intent targets an address the example policy does not allowlist, so it is refused
statically, before simulation, and needs no KeeperHub key. The response is `403` with a
`DENY` receipt and its digest. The same digest appears on the log:

```bash
docker exec noyeet-redpanda rpk topic consume noyeet.decisions.v1 -o start -n 1
```

and the anchor consumer batches it into a Merkle root:

```bash
docker exec noyeet-redpanda rpk topic consume noyeet.anchors.v1 -o start -n 1
```

## 4. Prove it fails closed

Point the gateway at a port with nothing listening and send an intent that passes every
static rule, so it must reach simulation:

```bash
KEEPERHUB_BASE_URL=http://127.0.0.1:9 BREAKER_FAILURE_THRESHOLD=2 \
  bun run --cwd apps/gateway start
```

The first two attempts return `502 DENY`. The third returns `503` with
`SIMULATOR_UNAVAILABLE` and a `Retry-After` header, and `/readyz` goes to `503` while
`/healthz` stays `200`.

The verdict is never `ALLOW`. That is the whole point: if the simulator cannot be reached,
the resulting state cannot be predicted, and an unpredictable state is exactly what noyeet
exists to refuse. Every other circuit breaker fails open to protect availability; this one
fails closed to protect the invariant.

## Dead letters

A record that cannot be parsed, or whose handler fails three times, is written to
`noyeet.dead-letter.v1` with its original bytes preserved as base64, and the offset is
committed so the partition keeps moving. Nothing is replayed automatically — a poison
message replayed on a timer is just a slower infinite loop.

```bash
docker exec noyeet-redpanda rpk topic consume noyeet.dead-letter.v1 -o start
```

## Known noise

Under Bun, `kafkajs` emits a one-off `TimeoutNegativeWarning` from its internal request
queue on connect. It is a clock-reporting difference inside the dependency, it fires once,
and delivery is unaffected — verified end to end against Redpanda. It is left unsuppressed
rather than hidden behind a global warning filter that would also hide real ones.
