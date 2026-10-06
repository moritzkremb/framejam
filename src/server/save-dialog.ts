import { execFile } from "node:child_process";

/**
 * Asks the user where to save a file with the system's own save dialog.
 * Resolves to the chosen path, `null` if they cancelled, or `undefined` when no dialog could be shown.
 */
export type ChooseSavePath = (defaultName: string, defaultDir: string) => Promise<string | null | undefined>;

interface Result {
  /** Exit code, or "ENOENT" when the program isn't installed. */
  code: number | string;
  stdout: string;
  stderr: string;
}

function run(cmd: string, args: string[], env?: Record<string, string>) {
  return new Promise<Result>((resolve) => {
    execFile(cmd, args, { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      resolve({ code: err ? ((err as NodeJS.ErrnoException).code ?? 1) : 0, stdout: String(stdout).trim(), stderr: String(stderr) });
    });
  });
}

const MAC_SCRIPT = [
  "on run argv",
  "activate",
  'set f to choose file name with prompt "Save video" default name (item 1 of argv) default location (POSIX file (item 2 of argv))',
  "return POSIX path of f",
  "end run",
];

const WINDOWS_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.SaveFileDialog
$d.Title = 'Save video'
$d.FileName = $env:FRAMEJAM_SAVE_NAME
$d.InitialDirectory = $env:FRAMEJAM_SAVE_DIR
$d.Filter = 'Video|*' + [IO.Path]::GetExtension($env:FRAMEJAM_SAVE_NAME) + '|All files|*.*'
$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }
if ($d.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write($d.FileName) }
`;

/** macOS: AppleScript's save dialog. Windows: the Windows Forms one via PowerShell. Linux: zenity, if installed. */
export const chooseSavePath: ChooseSavePath = async (defaultName, defaultDir) => {
  if (process.platform === "darwin") {
    const r = await run("osascript", [...MAC_SCRIPT.flatMap((line) => ["-e", line]), defaultName, defaultDir]);
    if (r.code === 0 && r.stdout) return r.stdout;
    return /-128/.test(r.stderr) ? null : undefined;
  }
  if (process.platform === "win32") {
    const r = await run("powershell.exe", ["-NoProfile", "-STA", "-Command", WINDOWS_SCRIPT], {
      FRAMEJAM_SAVE_NAME: defaultName,
      FRAMEJAM_SAVE_DIR: defaultDir,
    });
    if (r.code !== 0) return undefined;
    return r.stdout || null;
  }
  const r = await run("zenity", ["--file-selection", "--save", "--confirm-overwrite", "--title=Save video", `--filename=${defaultDir}/${defaultName}`]);
  if (r.code === 0 && r.stdout) return r.stdout;
  return r.code === 1 ? null : undefined;
};
