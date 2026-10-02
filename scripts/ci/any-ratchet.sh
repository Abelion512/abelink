#!/usr/bin/env bash
# Ratchet no-explicit-any (spec js-to-ts-spec.md W9).
#
# Berbeda dari `no-new-js.sh` (W0) yang melarang file JS BARU. Aqui policies
# berbeda: file .any yang ada sudah terlanjur warisan, jadi yang dijaga adalah
# ANGKA, bukanstruktur. Aturan:
#
#   1. Angka nyata > baseline di scripts/ci/any-baseline.json  -> GAGAL.
#   2. Angka nyata < baseline                                        -> LOLOS,
#      tapi CETAK pengingat supaya baseline ikut dikecilkan di PR yang sama.
#      Tanpa langkah ini ratchet tidak pernah mengatup.
#
# Dihitung per zona (contract / tests) supaya perbaikan di test tidak menutupi
# additions di zona kontrak produksi.
set -euo pipefail
cd "$(dirname "$0")/../.."

BASELINE="scripts/ci/any-baseline.json"

read_zone() { bun -e "console.log(JSON.parse(require('fs').readFileSync('$BASELINE','utf8')).zones['$1'])"; }
read_max()  { bun -e "console.log(JSON.parse(require('fs').readFileSync('$BASELINE','utf8')).max)"; }

REPORT="$(mktemp)"
trap 'rm -f "$REPORT"' EXIT

bunx eslint . -f json > "$REPORT" 2>/dev/null || true

if [ ! -s "$REPORT" ]; then
  echo "::error title=Any-ratchet::eslint tidak mengeluarkan laporan JSON — gate tidak bisa diverifikasi."
  exit 1
fi

# Hitung per zona dari laporan eslint.
bun -e '
const fs = require("fs")
const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
const RULE = "@typescript-eslint/no-explicit-any"
const zones = { contract: 0, tests: 0 }
const per = []
for (const f of data) {
  const n = f.messages.filter((m) => m.ruleId === RULE).length
  if (!n) continue
  const p = f.filePath.replace(process.cwd() + "/", "")
  const z = p.startsWith("tests/") ? "tests" : "contract"
  zones[z] += n
  per.push([n, p])
}
per.sort((a, b) => b[0] - a[0])
console.log(JSON.stringify({ zones, total: zones.contract + zones.tests, top: per.slice(0, 10) }))
' "$REPORT" > "$REPORT.summary"

TOTAL="$(bun -e "console.log(JSON.parse(require('fs').readFileSync('$REPORT.summary','utf8')).total)")"
ACTUAL_CONTRACT="$(bun -e "console.log(JSON.parse(require('fs').readFileSync('$REPORT.summary','utf8')).zones.contract)")"
ACTUAL_TESTS="$(bun -e "console.log(JSON.parse(require('fs').readFileSync('$REPORT.summary','utf8')).zones.tests)")"

MAX="$(read_max)"
MAX_CONTRACT="$(read_zone contract)"
MAX_TESTS="$(read_zone tests)"

echo "any-ratchet: nyata contract=$ACTUAL_CONTRACT tests=$ACTUAL_TESTS total=$TOTAL | baseline max=$MAX"

status=0
for pair in "contract:$ACTUAL_CONTRACT:$MAX_CONTRACT" "tests:$ACTUAL_TESTS:$MAX_TESTS"; do
  zone="${pair%%:*}"; rest="${pair#*:}"; actual="${rest%%:*}"; allowed="${rest##*:}"
  if [ "$actual" -gt "$allowed" ]; then
    echo "::error title=Any-ratchet::$zone: $actual > baseline $allowed (+$((actual - allowed))). Setiap \`any\` baru harus dibayar dengan menghapus \`any\` lama di PR yang sama."
    status=1
  elif [ "$actual" -lt "$allowed" ]; then
    echo "any-ratchet: $zone turun $allowed -> $actual. Turunkan baseline di $BASELINE sekarang juga, kalau tidak ratchet tidak mengatup."
  fi
done

if [ "$status" -ne 0 ]; then
  echo "10 berkas terpadat saat ini:"
  bun -e "JSON.parse(require('fs').readFileSync('$REPORT.summary','utf8')).top.forEach(([n,p])=>console.log('  '+n+'  '+p))"
  exit 1
fi

echo "any-ratchet: bersih (tidak ada penambahan any di luar baseline)"
