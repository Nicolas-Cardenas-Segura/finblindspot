# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

LABEL maintainer="Financial Blindspot Team"
LABEL description="Hardened Docker sandbox for safely executing Claude Code and Antigravity with auto-approval"

ARG USER_ID=1000
ARG GROUP_ID=1000
ARG USERNAME=sandbox

# Prevent interactive prompts during apt install
ENV DEBIAN_FRONTEND=noninteractive

# Install essential runtime tools & utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    gnupg \
    jq \
    make \
    procps \
    python3 \
    python3-pip \
    ripgrep \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Setup non-root sandbox user matching host UID and GID
RUN if getent group ${GROUP_ID} ; then \
        EXISTING_GROUP=$(getent group ${GROUP_ID} | cut -d: -f1); \
        useradd -l -u ${USER_ID} -g ${EXISTING_GROUP} -m -s /bin/bash ${USERNAME}; \
    else \
        groupadd -g ${GROUP_ID} ${USERNAME} && \
        useradd -l -u ${USER_ID} -g ${USERNAME} -m -s /bin/bash ${USERNAME}; \
    fi

# Configure npm global directory for sandbox user
ENV NPM_CONFIG_PREFIX=/home/${USERNAME}/.npm-global
ENV PATH="/home/${USERNAME}/.npm-global/bin:/home/${USERNAME}/.local/bin:${PATH}"

# Install Claude Code, OpenSpec, and TypeScript developer tooling globally
RUN npm install -g \
    @anthropic-ai/claude-code \
    @fission-ai/openspec \
    tsx \
    typescript

# Install Google Antigravity CLI binary
RUN curl -fsSL https://antigravity.google/cli/install.sh | bash -s -- -d /usr/local/bin \
    && chmod +x /usr/local/bin/agy 2>/dev/null || true

# Configure Git safe.directory system-wide to prevent dubious ownership issues on mounted volumes
RUN git config --system --add safe.directory /workspace \
    && git config --system --add safe.directory '*'

# Create workspace and configuration mount points with proper ownership
RUN mkdir -p /workspace \
    /home/${USERNAME}/.npm-global \
    /home/${USERNAME}/.gemini \
    /home/${USERNAME}/.claude \
    /home/${USERNAME}/.config \
    && chown -R ${USER_ID}:${GROUP_ID} /home/${USERNAME} /workspace

WORKDIR /workspace

# Copy and configure entrypoint
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER ${USERNAME}

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["bash"]
