#!/bin/sh
# install.sh — install the auto-relogin fix on the Pi.
#
# Run from your Mac, in the repo root:
#   scp deploy/lightdm/* eyesadmin@eyes.local:/tmp/
#   ssh -t eyesadmin@eyes.local 'sudo sh /tmp/install.sh'
set -e

install -m 0755 /tmp/eyes-relogin /usr/local/sbin/eyes-relogin
install -d /etc/lightdm/lightdm.conf.d
install -m 0644 /tmp/50-eyes-relogin.conf /etc/lightdm/lightdm.conf.d/50-eyes-relogin.conf

echo "Installed. Restarting lightdm (screens will flicker)..."
systemctl restart lightdm.service
