# Run container image: the pinned Goose release on a glibc base with C headers
# (goose run needs libc headers on Linux). One container runs one program.
FROM debian:bookworm-slim AS fetch
ARG GOOSE_VERSION=v2026.4
ARG GOOSE_SHA256=559ad7572df89fcd1273512d8679528bcdf876c252ec1f31608d3808b24125b3
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL -o /tmp/goose.tgz \
      "https://github.com/aardappel/goose/releases/download/${GOOSE_VERSION}/goose-${GOOSE_VERSION}-linux-x64.tar.gz" \
 && echo "${GOOSE_SHA256}  /tmp/goose.tgz" | sha256sum -c - \
 && mkdir /opt/goose && tar xzf /tmp/goose.tgz -C /opt/goose --strip-components=1 \
 && rm -rf /opt/goose/samples /opt/goose/man /opt/goose/vscode

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libc6-dev \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin runner
COPY --from=fetch /opt/goose /opt/goose
ENV PATH=/opt/goose:$PATH \
    GOOSE_HOME=/work/.goose \
    GOOSE_PROGRESS=plain \
    NO_COLOR=1
USER 10001
WORKDIR /work
# The runner writes main.goose into /work (a tmpfs) and runs /opt/goose/run.sh.
COPY --chmod=0555 run.sh /opt/goose/run.sh
ENTRYPOINT ["/opt/goose/run.sh"]
