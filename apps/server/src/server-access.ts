/**
 * Who uses a server (plan.md 18.8): the last seven days of SSH sign-ins with the key that was used
 * and whose it is, who is signed in now, sudo commands, and who keeps trying. One read-only command;
 * every line is "KEY:value", items split by ";" and fields by "~".
 */

const SINCE = "--since '7 days ago' --no-pager";
/** Key fingerprints and their labels, for root and every user with a home. */
const KEYS = `for f in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do [ -f "$f" ] && ssh-keygen -lf "$f" 2>/dev/null | awk -v u="$(echo $f | cut -d/ -f2-3 | sed 's#root/.ssh#root#;s#home/##')" '{c=$3; for(i=4;i<NF;i++) c=c" "$i; gsub(/[;~]/, ",", c); print $2"~"c"~"u}'; done`;

export const ACCESS_COMMAND = [
  `echo "WHO:$(who 2>/dev/null | awk '{f=$5; gsub(/[()]/, "", f); print $1"~"$2"~"$3" "$4"~"f}' | tr '\\n' ';')"`,
  `echo "ACCEPTED:$(journalctl -u ssh -u sshd ${SINCE} -o short-iso 2>/dev/null | grep 'Accepted ' | awk '{u="";ip="";m="";k="";p=""; for(i=1;i<=NF;i++){if($i=="Accepted")m=$(i+1); if($i=="for")u=$(i+1); if($i=="from")ip=$(i+1); if($i=="port")p=$(i+1); if($i ~ /^SHA256:/)k=$i}; print $1"~"u"~"ip"~"m"~"k"~"p}' | tail -300 | tr '\\n' ';')"`,
  // Sign-outs. sshd logs them from the session's own scope, not from ssh.service, so they are
  // found by sshd's name; the address and port tie each one to its sign-in.
  `echo "LEFT:$(journalctl -t sshd -t sshd-session ${SINCE} -o short-iso 2>/dev/null | grep 'Disconnected from user ' | awk '{for(i=1;i<=NF;i++) if($i=="user"){print $1"~"$(i+1)"~"$(i+2)"~"$(i+4); break}}' | tail -400 | tr '\\n' ';')"`,
  `echo "KEYS:$(${KEYS} | tr '\\n' ';')"`,
  `echo "FAILEDN:$(journalctl -u ssh -u sshd ${SINCE} 2>/dev/null | grep -cE 'Failed (password|publickey)|Invalid user')"`,
  `echo "FAILEDBY:$(journalctl -u ssh -u sshd ${SINCE} 2>/dev/null | grep -E 'Failed (password|publickey)|Invalid user' | grep -oE 'from [0-9a-f.:]+' | awk '{print $2}' | sort | uniq -c | sort -rn | head -8 | awk '{print $2"~"$1}' | tr '\\n' ';')"`,
  `echo "SUDO:$(journalctl _COMM=sudo ${SINCE} -o short-iso 2>/dev/null | grep 'COMMAND=' | tail -30 | awk '{c=substr($0, index($0, "COMMAND=")+8); gsub(/[;~]/, ",", c); print $1"~"$4"~"substr(c,1,100)}' | tr '\\n' ';')"`,
  // The system log is readable by root and by the adm, wheel and systemd-journal groups only.
  `echo "JOURNAL:$(command -v journalctl >/dev/null && { [ "$(id -u)" = 0 ] || id -nG | grep -qwE 'adm|wheel|systemd-journal'; } && echo yes || echo no)"`,
].join("; ");

export interface AccessReport {
  now: { user: string; tty: string; since: string; from: string }[];
  /** who: the key's label; "" for a known key without one, missing for a key nobody here has. */
  logins: {
    at: number;
    user: string;
    ip: string;
    method: string;
    key?: string;
    who?: string;
    /** When the session ended; missing while it is still open (or the sign-out was not logged). */
    left?: number;
  }[];
  keys: { fingerprint: string; label: string; account: string }[];
  failed: { total: number; top: { ip: string; count: number }[] };
  sudo: { at: number; user: string; command: string }[];
  /** False when the log could not be read (no systemd, not root): nothing is then known, not "nobody". */
  readable: boolean;
}

function lines(value: string | undefined): string[][] {
  return (value ?? "")
    .split(";")
    .filter((l) => l.trim())
    .map((l) => l.split("~").map((x) => x.trim()));
}

/** "2026-10-27T10:00:00+0300" (journalctl short-iso) as a time; JavaScript wants "+03:00". */
function isoTime(text: string): number {
  return Date.parse(text.replace(/([+-]\d\d)(\d\d)$/, "$1:$2")) || 0;
}

export function accessReport(output: string): AccessReport {
  const scan = new Map<string, string>();
  for (const line of output.split("\n")) {
    const at = line.indexOf(":");
    if (at > 0 && /^[A-Z]+$/.test(line.slice(0, at))) scan.set(line.slice(0, at), line.slice(at + 1));
  }
  // ssh-keygen writes "no comment" for a key without a label.
  const keys = lines(scan.get("KEYS")).map(([fingerprint = "", label = "", account = ""]) => ({
    fingerprint,
    label: label === "no comment" ? "" : label,
    account,
  }));
  const labelOf = new Map(keys.map((k) => [k.fingerprint, k.label]));
  // The first sign-out from the same address and port after the sign-in.
  const left = lines(scan.get("LEFT")).map(([at = "", user = "", ip = "", port = ""]) => ({
    at: isoTime(at),
    key: `${user}~${ip}~${port}`,
  }));
  const leftAt = (at: number, user: string, ip: string, port: string) =>
    left.find((l) => l.key === `${user}~${ip}~${port}` && l.at >= at)?.at;
  return {
    now: lines(scan.get("WHO")).map(([user = "", tty = "", since = "", from = ""]) => ({ user, tty, since, from })),
    logins: lines(scan.get("ACCEPTED"))
      .map(([at = "", user = "", ip = "", method = "", key = "", port = ""]) => {
        const time = isoTime(at);
        const end = port ? leftAt(time, user, ip, port) : undefined;
        return {
          at: time,
          user,
          ip,
          method,
          ...(key ? { key, who: labelOf.get(key) } : {}),
          ...(end ? { left: end } : {}),
        };
      })
      .reverse(),
    keys,
    failed: {
      total: Number(scan.get("FAILEDN") || 0),
      top: lines(scan.get("FAILEDBY")).map(([ip = "", count = "0"]) => ({ ip, count: Number(count) })),
    },
    sudo: lines(scan.get("SUDO"))
      .map(([at = "", user = "", command = ""]) => ({ at: isoTime(at), user, command }))
      .reverse(),
    readable: scan.get("JOURNAL") === "yes",
  };
}
