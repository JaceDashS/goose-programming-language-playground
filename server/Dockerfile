# Builds the hub and runner binaries. Select one with --target hub or --target runner.
FROM golang:1.26-bookworm AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/hub ./cmd/hub \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/runner ./cmd/runner

FROM gcr.io/distroless/static-debian12:nonroot AS hub
COPY --from=build /out/hub /hub
ENTRYPOINT ["/hub"]

# The runner drives the host Docker daemon through the mounted socket, so it needs the docker client.
FROM docker:29-cli AS runner
COPY --from=build /out/runner /usr/local/bin/runner
ENTRYPOINT ["/usr/local/bin/runner"]
