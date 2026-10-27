import { describe, expect, test } from "bun:test";
import { classifyCommand } from "./commands";

const risk = (command: string) => classifyCommand(command).risk;

describe("server command safety", () => {
  test("looking around is free", () => {
    for (const cmd of [
      "df -h /",
      "free -m && uptime",
      "tail -n 200 /var/log/nginx/error.log",
      "journalctl -u myapp --since today | grep -i error",
      "docker ps --format '{{.Names}}'",
      "docker compose logs --tail 50 api",
      "docker system df",
      "systemctl list-units --state=failed --no-pager",
      "systemctl status nginx",
      "git log --oneline -5",
      "cat /etc/os-release",
      "ls -la /srv/app 2>/dev/null",
      "curl -sI https://example.com",
      "sudo systemctl status docker",
      "crontab -l",
    ]) {
      expect(`${cmd} → ${risk(cmd)}`).toBe(`${cmd} → read`);
    }
  });

  test("changing things needs approval", () => {
    for (const cmd of [
      "systemctl restart nginx",
      "docker compose up -d --build",
      "git pull",
      "apt install htop",
      "npm install express",
      "echo hello > /etc/motd",
      "sed -i 's/a/b/' config.yml",
      "mv a b",
      "curl -X POST https://api.example.com/deploy",
      "find /tmp -name '*.log' -delete",
      "ls $(cat list.txt)",
      "some-unknown-tool --do-things",
      "cat x | tee out.txt",
    ]) {
      expect(`${cmd} → ${risk(cmd)}`).toBe(`${cmd} → change`);
    }
  });

  test("destructive commands need double approval", () => {
    for (const cmd of [
      "rm -rf /var/www/old",
      "sudo rm -r build",
      "psql -c 'DROP TABLE users'",
      "mkfs.ext4 /dev/sdb1",
      "reboot",
      "docker system prune -af",
      "git push --force origin main",
      "git reset --hard HEAD~3",
      "iptables -F",
      "chmod -R 777 /srv",
      "ls && shutdown -h now",
    ]) {
      expect(`${cmd} → ${risk(cmd)}`).toBe(`${cmd} → danger`);
    }
  });

  test("firewall status checks stay read-only", () => {
    expect(risk("ufw status verbose")).toBe("read");
    expect(risk("iptables -L -n")).toBe("change");
  });
});
