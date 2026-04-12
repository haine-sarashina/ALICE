// dev 起動前にポート 1420 を占有しているプロセスを解放する
const { execSync } = require("child_process");
const PORT = 1420;

try {
  execSync(
    `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
    { stdio: "ignore" }
  );
} catch {
  // ポートが使われていなければ何もしない
}
