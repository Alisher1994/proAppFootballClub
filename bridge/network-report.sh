#!/usr/bin/env bash
set -euo pipefail

echo "== Karasu bridge network report =="
echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo

IFACE="${1:-}"
if [ -z "$IFACE" ]; then
  IFACE="$(ip route show default 2>/dev/null | awk 'NR==1 {print $5}')"
fi

if [ -z "$IFACE" ]; then
  echo "No default network interface found."
  echo "Try: ip -br addr"
  exit 1
fi

IP_CIDR="$(ip -o -4 addr show dev "$IFACE" | awk 'NR==1 {print $4}')"
IP_ADDR="${IP_CIDR%%/*}"
PREFIX="${IP_CIDR#*/}"
GATEWAY="$(ip route show default 2>/dev/null | awk 'NR==1 {print $3}')"
MAC_ADDR="$(cat "/sys/class/net/$IFACE/address" 2>/dev/null || true)"

echo "Mini PC / bridge:"
echo "  interface: $IFACE"
echo "  ip:        ${IP_CIDR:-unknown}"
echo "  mac:       ${MAC_ADDR:-unknown}"
echo "  gateway:   ${GATEWAY:-unknown}"
echo

if [ -z "$IP_ADDR" ] || [ "$IP_ADDR" = "$IP_CIDR" ] && [ "$IP_CIDR" = "" ]; then
  echo "No IPv4 address on $IFACE."
  exit 0
fi

NET_PREFIX="$(echo "$IP_ADDR" | awk -F. '{print $1"."$2"."$3}')"

echo "Scanning ${NET_PREFIX}.0/24 to refresh ARP table..."
for i in $(seq 1 254); do
  ping -c 1 -W 1 "${NET_PREFIX}.${i}" >/dev/null 2>&1 &
done
wait || true
echo

echo "Known devices from ARP/neighbour table:"
printf "%-16s %-20s %s\n" "IP" "MAC" "Hint"
ip neigh show dev "$IFACE" | awk '/lladdr/ {print $1, $5}' | sort -V | while read -r ip mac; do
  hint=""
  case "$(echo "$mac" | tr '[:upper:]' '[:lower:]')" in
    88:de:39:*|50:31:23:*|68:3a:48:*)
      hint="possible Hikvision"
      ;;
    "$MAC_ADDR")
      hint="this mini PC"
      ;;
  esac
  printf "%-16s %-20s %s\n" "$ip" "$mac" "$hint"
done

echo
echo "What to write down for setup:"
echo "  Mini PC static IP suggestion: $IP_ADDR"
echo "  Mini PC MAC: $MAC_ADDR"
echo "  Terminal IPs: check rows marked 'possible Hikvision' and compare with SADP."
echo
echo "If you cannot access the router:"
echo "  Set static IPs directly on the mini PC and each Hikvision terminal."
