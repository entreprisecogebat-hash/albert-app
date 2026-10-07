#!/usr/bin/env bash
# Parcours de bout en bout sur l'API locale (donnees de demonstration chargees).
# Usage : scripts/smoke-api.sh [http://127.0.0.1:8000]
set -euo pipefail
[ -n "${DEBUG:-}" ] && set -x
B="${1:-http://127.0.0.1:8000}/api"; J='Content-Type: application/json'
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
# Git Bash : chemin Windows, sinon le ";type=" de curl -F declenche une conversion de chemin
command -v cygpath >/dev/null && TMP="$(cygpath -m "$TMP")"
# curl qui affiche la reponse en cas d'erreur HTTP
c(){ local out code; out=$(curl -sS -w '
%{http_code}' "$@") || { echo "curl a echoue : $*" >&2; return 1; }
  code="${out##*$'
'}"; out="${out%$'
'*}"
  if [ "$code" -ge 400 ]; then echo "HTTP $code sur $*" >&2; echo "$out" >&2; return 1; fi; printf '%s' "$out"; }
py(){ python -c "import sys,json;d=json.load(sys.stdin);$1"; }
login(){ local c; c=$(c -X POST $B/auth/request-code -H "$J" -d "{\"phone\":\"$1\"}" | py "print(d['devCode'])"); c -X POST $B/auth/verify -H "$J" -d "{\"phone\":\"$1\",\"code\":\"$c\"}" | py "print(d['token'])"; }
ok(){ printf '  \033[32mOK\033[0m %s\n' "$1"; }
ko(){ printf '  \033[31mKO\033[0m %s\n' "$1"; exit 1; }
uuid(){ python -c 'import uuid;print(uuid.uuid4())'; }

echo "Connexion"
H="Authorization: Bearer $(login 0612345678)"; ok "Karim connecté par SMS"
SITE=$(c $B/sites -H "$H" | py "print(d['items'][0]['id'])")
NAME=$(c $B/sites/$SITE -H "$H" | py "print(d['name'])"); [ "$NAME" = "Villa Marceau" ] && ok "Mes chantiers : Villa Marceau en tête" || ko "chantier en tête : $NAME"

echo "Je dépose"
printf '%%PDF-1.4\n%% calepinage %s\n%%%%EOF\n' "$(uuid)" > "$TMP/Plan_calepinage_final_v3.pdf"
SHA=$(sha256sum "$TMP/Plan_calepinage_final_v3.pdf" | cut -d' ' -f1)
ST=$(c -X POST $B/sites/$SITE/documents/analyze -H "$H" -H "$J" -d "{\"filename\":\"Plan_calepinage_final_v3.pdf\",\"sha256\":\"$SHA\"}" | py "print(d['statement'], '|', (d['newVersionOf'] or {}).get('title'))")
[[ "$ST" == "Albert a reconnu un plan, version 3. | Plan de calepinage" ]] && ok "$ST" || ko "analyse : $ST"
CID=$(uuid)
R=$(c -X POST $B/sites/$SITE/documents -H "$H" -F "file=@$TMP/Plan_calepinage_final_v3.pdf;type=application/pdf" -F "clientId=$CID" | py "print(d['document']['current']['label'], d['document']['versionsCount'])")
[ "$R" = "V3 3" ] && ok "Enregistré comme V3 du même document" || ko "dépôt : $R"
R=$(c -X POST $B/sites/$SITE/documents -H "$H" -F "file=@$TMP/Plan_calepinage_final_v3.pdf;type=application/pdf" -F "clientId=$CID" | py "print(d['replayed'], d['document']['versionsCount'])")
[ "$R" = "True 3" ] && ok "Rejeu hors ligne idempotent" || ko "rejeu : $R"
R=$(c -X POST $B/sites/$SITE/documents -H "$H" -F "file=@$TMP/Plan_calepinage_final_v3.pdf;type=application/pdf" -F "clientId=$(uuid)" | py "print(d['duplicate'])")
[ "$R" = "True" ] && ok "Doublon reconnu par empreinte" || ko "doublon : $R"

echo "Je retrouve, je prouve"
R=$(c "$B/sites/$SITE/search?q=calepinage" -H "$H" | py "print(','.join(r['kind']+':'+(r.get('version') or r['document']['current'])['label'] for r in d['items']))")
[ "$R" = "document:V3,version:V2,version:V1" ] && ok "Recherche : la V3 fait foi, V2 et V1 remplacées" || ko "recherche : $R"
DOC=$(c "$B/sites/$SITE/search?q=calepinage" -H "$H" | py "print(d['items'][0]['document']['id'])")
R=$(c "$B/documents/$DOC" -H "$H" | py "print(' / '.join(v['label']+' '+v['uploadedBy']['firstName'] for v in d['versions']))")
[ "$R" = "V3 Karim / V2 Karim / V1 Sophie" ] && ok "Historique : $R" || ko "historique : $R"
URL=$(c "$B/documents/$DOC" -H "$H" | py "print(d['versions'][0]['url'])")
[ "$(curl -s -o /dev/null -w '%{http_code}' "$URL")" = 200 ] && ok "Fichier servi par URL signée" || ko "url signée"
[ "$(curl -s -o /dev/null -w '%{http_code}' "${URL}0")" = 403 ] && ok "URL falsifiée refusée" || ko "url falsifiée"

echo "Photos et messages"
python - "$TMP/p.jpg" <<'PY'
import sys,struct,zlib
# JPEG minimal 1x1 (blanc)
open(sys.argv[1],'wb').write(bytes.fromhex('ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00fbd3ffd9'))
PY
BATCH=$(uuid)
for i in 1 2; do c -X POST $B/sites/$SITE/photos -H "$H" -F "file=@$TMP/p.jpg;type=image/jpeg" -F "clientId=$(uuid)" -F "batchId=$BATCH" -F "takenAt=$(date -u -d "-$((40-i)) minutes" +%Y-%m-%dT%H:%M:%SZ)" -F "latitude=48.8946" -F "longitude=2.2874" -F "caption=Pose des menuiseries" > /dev/null; done
R=$(c "$B/sites/$SITE/feed?filter=photos" -H "$H" | py "i=[x for x in d['items'] if x.get('caption')=='Pose des menuiseries'][0];print(i['title'], len(i['photos']))")
[ "$R" = "2 photos 2" ] && ok "Lot de photos regroupé dans le fil" || ko "photos : $R"
CH=$(c $B/sites/$SITE -H "$H" | py "print([c['id'] for c in d['channels'] if c['kind']=='client'][0])")
c -X POST $B/channels/$CH/messages -H "$H" -H "$J" -d "{\"body\":\"Oui, la livraison du 15 est confirm\u00e9e.\",\"clientId\":\"$(uuid)\"}" > /dev/null
R=$(c $B/sites/$SITE -H "$H" | py "print([c['awaitingReply'] for c in d['channels'] if c['kind']=='client'][0])")
[ "$R" = "False" ] && ok "Réponse au client : plus de « Réponse attendue »" || ko "réponse attendue : $R"

echo "Droits et isolation"
HC="Authorization: Bearer $(login 0698765432)"
R=$(c "$B/sites/$SITE" -H "$HC" | py "print([c['kind'] for c in d['channels']])")
[ "$R" = "['client']" ] && ok "Le client ne voit que le canal client" || ko "canaux client : $R"
R=$(c "$B/sites/$SITE/feed" -H "$HC" | py "print(all(i['visibility']=='client' for i in d['items']))")
[ "$R" = "True" ] && ok "Le client ne voit que ce qui lui est partagé" || ko "fil client"
HP="Authorization: Bearer $(login 0655443322)"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$B/sites/$SITE" -H "$HP")" = 404 ] && ok "Patenotte ne voit pas les chantiers Cogebat" || ko "isolation tenant"
HW="Authorization: Bearer $(login 0633445566)"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$B/admin/sites" -H "$HW")" = 403 ] && ok "Back-office refusé à un compagnon" || ko "admin"
echo "Tout est bon."
