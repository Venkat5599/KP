#!/usr/bin/env bash
# noyeet VPS provisioning. Idempotent: safe to re-run.
# Usage:  bash provision.sh [--lockdown]
#   --lockdown  disable SSH password auth (only after your key is confirmed working)
set -euo pipefail

DEPLOY_USER="noyeet"
APP_DIR="/opt/noyeet"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }

log "base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl git unzip build-essential pkg-config libssl-dev \
  ufw fail2ban unattended-upgrades postgresql-client jq ca-certificates

log "swap (if absent and RAM < 4G)"
if [ ! -f /swapfile ] && [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 4000 ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap -q /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "deploy user"
id -u "$DEPLOY_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
if [ -f /root/.ssh/authorized_keys ]; then
  cp /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi
install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"

log "firewall"
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

log "fail2ban + unattended upgrades"
systemctl enable --now fail2ban >/dev/null 2>&1 || true
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true

log "bun"
sudo -u "$DEPLOY_USER" bash -lc '
  [ -x "$HOME/.bun/bin/bun" ] || curl -fsSL https://bun.sh/install | bash
  grep -q ".bun/bin" "$HOME/.bashrc" || echo "export PATH=\"$HOME/.bun/bin:$PATH\"" >> "$HOME/.bashrc"
'

log "foundry"
sudo -u "$DEPLOY_USER" bash -lc '
  [ -x "$HOME/.foundry/bin/forge" ] || { curl -fsSL https://foundry.paradigm.xyz | bash; "$HOME/.foundry/bin/foundryup"; }
  grep -q ".foundry/bin" "$HOME/.bashrc" || echo "export PATH=\"$HOME/.foundry/bin:$PATH\"" >> "$HOME/.bashrc"
'

log "systemd units"
cat > /etc/systemd/system/noyeet-gateway.service <<UNIT
[Unit]
Description=noyeet gateway (policy VM + KeeperHub executor)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$DEPLOY_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/home/$DEPLOY_USER/.bun/bin/bun run apps/gateway/src/index.ts
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$APP_DIR

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/noyeet-agent.service <<UNIT
[Unit]
Description=noyeet live agent (Aave health-factor keeper)
After=noyeet-gateway.service
Requires=noyeet-gateway.service

[Service]
Type=simple
User=$DEPLOY_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/home/$DEPLOY_USER/.bun/bin/bun run apps/agent/src/index.ts
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload

if [ "${1:-}" = "--lockdown" ]; then
  log "disabling SSH password auth"
  sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
  sshd -t && systemctl reload ssh
fi

log "done"
echo "  deploy user : $DEPLOY_USER"
echo "  app dir     : $APP_DIR"
echo "  units       : noyeet-gateway.service, noyeet-agent.service (not started - no code yet)"
echo "  next        : copy repo to $APP_DIR, write $APP_DIR/.env, systemctl enable --now noyeet-gateway"
