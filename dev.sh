#!/usr/bin/env bash
set -e
cd $(
	cd $(dirname $0)
	pwd -P
)
[ -f .env ] && export $(cat .env | xargs) || echo "there is no .env, skip"

function usage() {
	cat <<EOS
To execute pre-defined commands with Docker.
Usage:
	./$(basename $0) <Command> [args...]
Command:
EOS
	egrep -o "^\s*function.*#cmd.*" $(basename $0) | sed "s/^[ \t]*function//" | sed "s/[ \t\(\)\{\}]*#cmd//" |
		awk '{CMD=$1; $1=""; printf "\t%-16s%s\n", CMD, $0}'
}

function pg(){ #cmd pg for testing
	docker run --name pgtrigger -p5432:5432 -e POSTGRES_PASSWORD=mysecretpassword -d postgres
}

function pgcli(){ #cmd pgcli
	docker run -it --rm --link pgtrigger:postgres pygmy/pgcli
}

function sslexport(){ #cmd sslexport  <domain> to <domain>.pem
	openssl s_client -showcerts -connect $1:443 </dev/null | sed -n -e '/-.BEGIN/,/-.END/ p' > $1.pem
}

function readpem(){ #cmd readpem $1 (./dev.sh readpem xxxx.pem)
	openssl x509 -in $1 -noout -text
}

function firestoreRules(){ #cmd firestoreRules
	firebase deploy --only firestore:rules
}

if [ $# -eq 0 ]; then
	usage
else
	export COMPOSE_HTTP_TIMEOUT=600
	CMD=$1
	shift
	$CMD $@
fi
