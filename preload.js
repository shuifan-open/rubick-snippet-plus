const fs = require('fs')
const path = require('path')
const os = require('os')
const child_process = require('child_process')

const api = window.rubick || window.utools || {}

const isWindows = os.platform() === 'win32'
const ctlKey = api.isMacOs && api.isMacOs() ? 'command' : 'control'

// ---- clipboard ----
const getClipboard = () => {
  try {
    return require('electron').clipboard
  } catch (e) {
    return null
  }
}
window.readClip = () => {
  try {
    const c = getClipboard()
    if (c) return c.readText()
  } catch (e) {}
  return ''
}
window.writeClip = (text) => {
  try {
    const c = getClipboard()
    if (c) return c.writeText(text)
  } catch (e) {}
  if (api.copyText) {
    try { return api.copyText(text) } catch (e) {}
  }
  try { navigator.clipboard.writeText(text) } catch (e) {}
}

// ---- paste simulation ----
// 原生方案（首选）：不依赖 Rubick 缺失的 key-sender.jar
window.simulatePaste = () => {
  try {
    if (api.isMacOs && api.isMacOs()) {
      // macOS：用 osascript 发送 cmd+v（keystroke 需辅助功能权限，但为最可靠路径）
      child_process.execSync(
        `osascript -e 'tell application "System Events" to keystroke "v" using command down'`,
        { stdio: 'ignore' }
      )
      return
    }
    // Windows：PowerShell SendKeys 发送 Ctrl+V
    const vbs = path.join(os.tmpdir(), 'snippet-paste.vbs')
    fs.writeFileSync(vbs, 'set ws=CreateObject("WScript.Shell")\nws.SendKeys "^v"\n')
    child_process.execSync(`cscript //nologo "${vbs}"`, {
      windowsHide: true,
      timeout: 5000,
      stdio: 'ignore'
    })
  } catch (e) {
    // 回退：Rubick 自带的模拟按键（依赖 key-sender.jar，缺失时静默失败）
    if (api.simulateKeyboardTap) {
      try { api.simulateKeyboardTap('v', ctlKey) } catch (err) {}
    }
  }
}

// ---- sleep ----
const toSleepShellCode = (ms) => {
  if (isWindows) {
    const tmp = path.join(os.tmpdir(), 'snippetShellTemp.vbs')
    return `echo set ws=CreateObject("Wscript.Shell") > ${tmp} && echo Wscript.sleep ${ms} >> ${tmp} && cscript /nologo ${tmp}`
  }
  return `sleep ${ms / 1000}`
}
window.sleep = (ms) => {
  const start = Date.now()
  try {
    child_process.execSync(toSleepShellCode(ms), { timeout: ms, windowsHide: true })
  } catch (e) {}
  return Date.now() - start
}

// ---- 让焦点回到打开 Rubick 之前的应用 ----
window.focusPreviousWindow = () => {
  try {
    if (isWindows) {
      // 隐藏 Rubick 后，最前面（Z 序顶层）的可见、非 Rubick 窗口即目标程序
      const ps = `
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class F {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dw);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L,T,Ri,B; }
  public static IntPtr Pick;
  public static void Run(string exclude){
    Pick = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l){
      if(!IsWindowVisible(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      System.Diagnostics.Process p;
      try { p = System.Diagnostics.Process.GetProcessById((int)pid); } catch { return true; }
      string n = p.ProcessName.ToLower();
      if(n.Contains(exclude)) return true;
      if(n=="powershell"||n=="conhost"||n=="cmd"||n=="pwsh") return true;
      StringBuilder s = new StringBuilder(256);
      GetWindowText(h, s, 256);
      if(s.Length==0) return true;
      if(p.MainWindowHandle != h) return true;
      R r; GetWindowRect(h, out r);
      if(r.Ri-r.L<=0 || r.B-r.T<=0) return true;
      Pick = h;
      return false;
    }, IntPtr.Zero);
    if(Pick != IntPtr.Zero){
      keybd_event(0x12, 0, 0, UIntPtr.Zero);
      keybd_event(0x12, 0, 2, UIntPtr.Zero);
      SetForegroundWindow(Pick);
    }
  }
}
'@;
[F]::Run('rubick');
`;
      const psFile = path.join(os.tmpdir(), 'snippet-focus.ps1')
      fs.writeFileSync(psFile, ps)
      child_process.execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`,
        { windowsHide: true, timeout: 8000, stdio: 'ignore' }
      )
    } else if (api.isMacOs && api.isMacOs()) {
      child_process.execSync(
        `osascript -e 'tell application "System Events" to set frontmost of first application process whose frontmost is false and visible is true to true'`,
        { stdio: 'ignore' }
      )
    }
  } catch (e) {}
}

// ---- 一键粘贴：复制 -> 隐藏 -> 恢复焦点 -> 粘贴 ----
window.pasteSnippet = (text) => {
  try {
    window.writeClip(text)
    if (api.hideMainWindow) api.hideMainWindow()
    // 隐藏后让系统有时间释放焦点
    window.sleep(150)
    // 切回目标窗口（PowerShell SetForegroundWindow 异步生效）
    window.focusPreviousWindow()
    // 等焦点稳定后粘贴（SendKeys 同步、快速）
    window.sleep(600)
    window.simulatePaste()
    return true
  } catch (e) {
    if (api.showNotification) api.showNotification('paste failed: ' + (e && e.message))
    return false
  }
}

// ---- path validation (used by settings) ----
window.validatePath = (p) => {
  if (!fs.existsSync(p)) return null
  const st = fs.statSync(p)
  if (st.isDirectory()) return 'dir'
  if (st.isFile()) {
    fs.readFileSync(p, 'utf8')
    return 'file'
  }
  return null
}

// ---- markdown reading & parsing ----
const readFile = (p) => {
  if (path.extname(p) !== '.md') return ''
  return fs.readFileSync(p, 'utf8')
}

const readDirOrFile = (p) => {
  let raw = ''
  if (!fs.existsSync(p)) {
    return '# 当前配置文件不存在 \n```'
  }
  const st = fs.statSync(p)
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(p)) {
      const fp = path.join(p, f)
      if (fs.statSync(fp).isDirectory()) {
        raw += readDirOrFile(fp)
      } else {
        raw += readFile(fp)
      }
    }
  } else if (st.isFile()) {
    raw += readFile(p)
  }
  return raw
}

const trimTextlist = (list) => {
  while (list.length && list[0] === '') list.shift()
  while (list.length && list[list.length - 1] === '') list.pop()
  return list
}

window.loadSnippets = (mdPath) => {
  const raw = readDirOrFile(mdPath)
  return raw
    .split(/#\s/)
    .filter((i) => i.trim() !== '')
    .map((b) => {
      const rows = b.split(/\n/).filter((r) => !r.startsWith('```'))
      return {
        title: rows[0],
        description: trimTextlist(rows.slice(1)).join('\n')
      }
    })
}

// ---- subsequence search ----
window.searchSnippets = (snippets, searchWord) => {
  if (!searchWord) return snippets
  const kws = searchWord.toLowerCase().split(/\s/).filter((i) => i.trim() !== '')
  return snippets.filter((item) =>
    kws.every((k) => {
      // subsequence check
      let si = 0
      const t = item.title.toLowerCase()
      for (let i = 0; i < t.length && si < k.length; i++) {
        if (t[i] === k[si]) si++
      }
      return si === k.length
    })
  )
}

// ---- rubick helpers ----
// rubick.db / dbStorage 均为同步调用，直接返回值
window.rubickApi = {
  onPluginReady: (cb) => api.onPluginReady && api.onPluginReady(cb),
  setSubInput: (cb, placeholder, isFocus) =>
    api.setSubInput && api.setSubInput(cb, placeholder, isFocus),
  setSubInputValue: (text) => api.setSubInputValue && api.setSubInputValue(text),
  hideMainWindow: () => api.hideMainWindow && api.hideMainWindow(),
  showNotification: (msg) => api.showNotification && api.showNotification(msg),
  // 简单键值存储（等价于 utools.dbStorage）
  dbGet: (key) => {
    try {
      if (api.dbStorage) return api.dbStorage.getItem(key)
      const r = api.db && api.db.get(String(key))
      return r && 'value' in r ? r.value : null
    } catch (e) {
      return null
    }
  },
  dbSet: (key, value) => {
    try {
      if (api.dbStorage) return api.dbStorage.setItem(key, value)
      return api.db && api.db.put({ _id: String(key), value })
    } catch (e) {}
  }
}
