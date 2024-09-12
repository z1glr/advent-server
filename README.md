# todo
- catch more stuff
- build-script: create init-script which generates config etc
- debug freezing in supervisorctl

# admin-passwort
F0p9ü7+IÖ$TäuKF+UYÄf

# setup / fix bcrypt
npm rebuild bcrypt --build-from-source


# error
node:internal/process/promises:391
    triggerUncaughtException(err, true /* fromPromise */);
    ^

Error: Cannot enqueue Query after fatal error.
    at Xe._validateEnqueue (/home/z1glr/advent/advent-server/dist/latest/server.js:1188:50132)
    at Xe._enqueue (/home/z1glr/advent/advent-server/dist/latest/server.js:1188:49130)
    at Ge.query (/home/z1glr/advent/advent-server/dist/latest/server.js:1189:6318)
    at /home/z1glr/advent/advent-server/dist/latest/server.js:1189:24140
    at e._execute (/home/z1glr/advent/advent-server/dist/latest/server.js:69:3752)
    at C._resolveFromExecutor (/home/z1glr/advent/advent-server/dist/latest/server.js:229:7117)
    at new Promise (/home/z1glr/advent/advent-server/dist/latest/server.js:229:267)
    at Ge.promiseCallback (/home/z1glr/advent/advent-server/dist/latest/server.js:1189:23977)
    at t1.query (/home/z1glr/advent/advent-server/dist/latest/server.js:1189:24853)
    at db_query (/home/z1glr/advent/advent-server/dist/latest/server.js:1356:12088)
    at check_admin (/home/z1glr/advent/advent-server/dist/latest/server.js:1356:11939)
    at get_posts (/home/z1glr/advent/advent-server/dist/latest/server.js:1356:23209)
    at /home/z1glr/advent/advent-server/dist/latest/server.js:1356:17637
    at iiaf_wrap (/home/z1glr/advent/advent-server/dist/latest/server.js:1356:10662)
    at /home/z1glr/advent/advent-server/dist/latest/server.js:1356:17562
    at Ms.handle [as handle_request] (/home/z1glr/advent/advent-server/dist/latest/server.js:30:4159) {
  code: 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  fatal: false
}

Node.js v20.17.0