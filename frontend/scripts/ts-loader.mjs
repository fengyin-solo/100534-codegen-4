// 无头测试的最小加载器：把源码里的 @ 别名解析到 src，.ts 用 esbuild 即时转译。
import { pathToFileURL, fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { transform } from 'esbuild'

const ROOT = resolvePath(process.cwd())

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2)
    for (const candidate of [`src/${rel}.ts`, `src/${rel}/index.ts`]) {
      const full = resolvePath(ROOT, candidate)
      if (existsSync(full)) {
        return { url: pathToFileURL(full).href, shortCircuit: true }
      }
    }
  }
  // 源码里相对导入常省略 .ts 扩展名，这里补全后再交给默认解析。
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/.test(specifier) && context.parentURL) {
    const base = new URL(context.parentURL)
    for (const suffix of ['.ts', '/index.ts']) {
      const candidate = new URL(specifier + suffix, base)
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true }
      }
    }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts')) {
    const fileUrl = new URL(url)
    const source = await nextLoad(url, { ...context, format: 'module' }).then((r) => r.source)
    const { code } = await transform(source.toString(), {
      loader: 'ts',
      format: 'esm',
      target: 'es2020',
    })
    return { format: 'module', source: code, shortCircuit: true }
  }
  return nextLoad(url, context)
}
