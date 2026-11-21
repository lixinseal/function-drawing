# 函数绘图

面向初中和高中函数学习的离线二维函数绘图 PWA。输入函数表达式后即可绘制图像，并支持多函数、参数滑块、自适应采样、交点吸附、坐标投影、本地保存和离线运行。

正式地址：

```text
https://lixinseal.github.io/function-drawing/
```

## 功能

- 显式函数 `y=f(x)` 实时绘制
- 多函数、颜色、显示、隐藏和编辑
- 数字、小数点、四则运算符和逐字符删除键
- 虚拟键盘输入不会主动弹出系统软键盘
- 平移、缩放、网格、坐标轴和坐标读数
- 参数滑块，例如 `a*sin(b*x+c)` 中的 `a`、`b`、`c`
- x 轴交点、y 轴交点和曲线交点检测
- 交点和坐标轴特殊点吸附
- 三角函数吸附到 `kπ/n` 特殊横坐标
- Apple Pencil 使用更大的交点命中范围
- 选中点后显示到 x 轴、y 轴的投影虚线及轴数值
- 右侧读数面板显示函数、x、y 和数值斜率
- 本地自动保存、JSON 打开和 PNG 导出
- 完全离线的 Service Worker PWA

## 表达式

支持：

- 变量：`x`
- 参数：单个字母，例如 `a`、`b`、`k`、`m`
- 常量：`pi`、`e`
- 运算：`+`、`-`、`*`、`/`、`^`
- 函数：`sin`、`cos`、`tan`、`asin`、`acos`、`atan`、`sqrt`、`cbrt`、`abs`、`exp`、`ln`、`log`、`log10`、`log2`、`floor`、`ceil`、`round`、`sign`

示例：

```text
sin(x)
x^2-2*x-3
1/(x-1)
a*sin(b*x+c)
sqrt(4-x^2)
```

## 技术结构

```text
src/
  graph/
    renderer.ts       Canvas 2D 网格、曲线和交点渲染
    viewport.ts       世界坐标与屏幕坐标转换
  math/
    expression.ts     表达式解析、白名单校验和编译求值
    sampling.ts       自适应函数采样和断点处理
    analysis.ts       零点、轴交点和曲线交点分析
  main.ts             应用状态、UI、触控和交互逻辑
  style.css           响应式桌面与 iPad 界面
scripts/
  prepare-icons.mjs   构建前恢复 PWA 图标
  build-pwa.mjs       生成带内容哈希的 Service Worker
  icon-data.json      图标的 Base64 源数据
public/
  manifest.webmanifest
  offline.html
  icons/
```

技术栈：

- TypeScript
- Vite
- Canvas 2D
- Lucide Icons
- Service Worker

## 本地开发

安装依赖：

```powershell
npm install
```

启动开发服务器：

```powershell
npm run dev
```

默认地址：

```text
http://127.0.0.1:4174/
```

Windows 也可以直接双击 `start.cmd`。

## 构建

```powershell
npm run build
```

构建会依次执行：

1. 恢复 PWA 图标
2. TypeScript 类型检查
3. Vite 生产构建
4. 计算资源哈希并生成 `dist/sw.js`

构建结果位于：

```text
dist/
```

Windows 也可以直接双击 `build.cmd`。

## GitHub Actions 发布

仓库中的：

```text
.github/workflows/deploy-pages.yml
```

会在代码推送到 `main` 后自动：

1. 安装依赖
2. 构建 PWA
3. 上传 GitHub Pages 构建产物
4. 发布到固定的 GitHub Pages 地址

GitHub Actions 的每次运行编号会变化，但正式应用地址始终不变。

## iPad 安装

1. 在 iPad Safari 打开正式地址。
2. 等待首次加载完成。
3. 从分享菜单选择“添加到主屏幕”。
4. 从主屏幕启动应用。
5. 关闭网络后再次启动，验证完全离线运行。

## iPad 更新

更新后不需要重新安装或登录新地址：

1. 完全关闭主屏幕中的函数绘图应用。
2. 从原主屏幕图标重新打开。
3. 必要时在 Safari 中从固定地址手动刷新一次。

临时缓存刷新参数可以写成 `?v=提交哈希`，但它只是刷新辅助，不是新的应用地址。

## 数据与离线

- 图形文档自动保存在浏览器本地存储中。
- 保存按钮下载 JSON 文档。
- 打开按钮读取本地 JSON 文档。
- 导出按钮下载当前画布 PNG。
- Service Worker 只清理以 `function-drawing-` 开头的缓存。

函数绘图与立体几何绘图是两个完全独立的应用，不共享源码、运行数据或渲染引擎。
