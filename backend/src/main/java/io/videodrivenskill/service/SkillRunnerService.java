package io.videodrivenskill.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.videodrivenskill.model.SkillFile;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class SkillRunnerService {

  private final SkillService skillService;
  private final KnowledgeService knowledgeService;
  private final ObjectMapper objectMapper = new ObjectMapper();

  @Value("${app.runner.timeout:180}")
  private int timeoutSeconds;

  @Data
  @Builder
  public static class RunResult {
    private boolean success;
    private int exitCode;
    private List<String> logs;
    private List<Screenshot> screenshots;
    private String error;
    private long durationMs;
    private String data; // 存储脚本返回的完整JSON结果

    @Data
    @Builder
    public static class Screenshot {
      private String label;
      private String base64Image;
      private long timestamp;
    }
  }

  @Data
  @Builder
  public static class RunOptions {
    private String platform; // browser, android, ios, computer
    private String targetUrl; // 目标网址（browser）
    private String deviceId; // 设备ID（android/ios）
    private boolean headless; // 无头模式
    private Map<String, String> variables; // 变量值映射
    private Integer timeoutSeconds; // 本次任务超时（秒），null 走全局默认
  }

  @Data
  @Builder
  public static class DeviceInfo {
    private String id;
    private String model;
    private String state; // device, offline, unauthorized
    private String platform; // android, ios
  }

  /** 运行 Skill 脚本 */
  public RunResult runSkill(String skillId, RunOptions options, Consumer<String> logConsumer) {
    long startTime = System.currentTimeMillis();
    String runId = UUID.randomUUID().toString();
    Path tempDir = null;

    try {
      // 1. 获取 Skill 文件
      SkillFile skillFile = skillService.getSkill(skillId);
      logConsumer.accept("📦 准备运行 Skill: " + skillFile.getSkillName());
      logConsumer.accept("🖥️ 平台: " + options.getPlatform());

      if (options.getDeviceId() != null) {
        logConsumer.accept("📱 设备: " + options.getDeviceId());
      }

      // 2. 创建临时目录
      tempDir = createTempDir(runId);
      Path scriptsDir = tempDir.resolve("scripts");
      Files.createDirectories(scriptsDir);
      logConsumer.accept("📁 工作目录: " + tempDir);

      // 3. 写入文件
      writeSkillFiles(skillFile, tempDir, scriptsDir);
      logConsumer.accept("📝 写入 " + skillFile.getFiles().size() + " 个文件");

      // 3.1 拷贝知识库（如有）
      try {
        knowledgeService.copyKnowledgeTo(skillId, tempDir);
        Path kbDir = tempDir.resolve("knowledge");
        if (Files.exists(kbDir)) {
          long kbCount =
              Files.list(kbDir)
                  .filter(p -> !p.getFileName().toString().equals("knowledge.json"))
                  .count();
          if (kbCount > 0) {
            logConsumer.accept("📚 加载知识库：" + kbCount + " 个文件");
          }
        }
      } catch (Exception e) {
        log.warn("Failed to copy knowledge base: {}", e.getMessage());
      }

      // 4. 检查并使用本地 midscene 缓存
      Path localMidsceneCache = findLocalMidsceneCache();
      if (localMidsceneCache != null) {
        logConsumer.accept("📦 发现本地 midscene 缓存: " + localMidsceneCache);
        try {
          linkLocalMidscene(tempDir, localMidsceneCache, logConsumer);
          logConsumer.accept("✅ 已链接本地 midscene");
        } catch (Exception e) {
          log.warn("Failed to link local midscene, will use npm install", e);
          logConsumer.accept("⚠️ 本地链接失败，将使用 npm 安装");
        }
      }

      // 5. 安装依赖（如果本地链接成功，这会很快）
      logConsumer.accept("⬇️ 安装依赖中... (npm install)");
      // 设置 PUPPETEER_SKIP_DOWNLOAD 跳过浏览器下载，使用系统已安装的 Chrome
      // 使用 --legacy-peer-deps 避免一些兼容性问题
      // 使用 --prefer-offline 优先使用本地缓存
      Map<String, String> npmEnv = Map.of("PUPPETEER_SKIP_DOWNLOAD", "true");
      int npmExit =
          runProcess(
              npmCommand("install", "--legacy-peer-deps", "--prefer-offline", "--progress=false"),
              tempDir,
              npmEnv,
              line -> {
                // npm 输出过滤，显示进度和关键信息
                String lower = line.toLowerCase();
                if (line.contains("added")
                    || line.contains("removed")
                    || line.contains("changed")
                    || line.contains("packages")
                    || line.contains("up to date")
                    || lower.contains("err")
                    || lower.contains("error")
                    || lower.contains("warn")
                    || (lower.contains("npm") && !line.contains("http"))) {
                  logConsumer.accept("[npm] " + line);
                }
              },
              300); // 增加到 5 分钟超时
      if (npmExit != 0) {
        return buildErrorResult(startTime, npmExit, "npm install 失败，请检查网络连接或手动安装依赖");
      }
      logConsumer.accept("✅ 依赖安装完成");

      // 5. 修改脚本注入日志和截图
      injectInstrumentation(
          scriptsDir.resolve("main.js"), options.getPlatform(), options.getVariables());

      // 6. 执行脚本
      logConsumer.accept("🚀 开始执行脚本...");
      RunResult result = executeScript(tempDir, options, logConsumer);

      // 7. 收集截图
      List<RunResult.Screenshot> screenshots = collectScreenshots(tempDir);
      result.setScreenshots(screenshots);
      result.setDurationMs(System.currentTimeMillis() - startTime);

      // 8. 清理（异步，不阻塞返回）
      final Path cleanupDir = tempDir;
      CompletableFuture.runAsync(() -> cleanup(cleanupDir));

      return result;

    } catch (Exception e) {
      log.error("Failed to run skill", e);
      if (tempDir != null) {
        cleanup(tempDir);
      }
      return buildErrorResult(startTime, -1, e.getMessage());
    }
  }

  /** 获取 Android 设备列表 */
  public List<DeviceInfo> listAndroidDevices() {
    List<DeviceInfo> devices = new ArrayList<>();

    try {
      String output = runProcessForOutput(List.of("adb", "devices", "-l"), null, 10);
      log.debug("adb devices output: {}", output);

      // 解析输出：
      // List of devices attached
      // abc12345               device usb:123456 product:xxx model:Pixel_6 device:xxx
      // transport_id:1
      // def67890               unauthorized usb:...
      String[] lines = output.split("\n");
      for (String line : lines) {
        line = line.trim();
        if (line.isEmpty() || line.startsWith("List of")) {
          continue;
        }

        // 解析：id + 状态 + 属性
        String[] parts = line.split("\\s+");
        if (parts.length >= 2) {
          String id = parts[0];
          String state = parts[1];
          String model = extractValue(line, "model:");

          devices.add(
              DeviceInfo.builder()
                  .id(id)
                  .model(model != null ? model : "Unknown")
                  .state(state)
                  .platform("android")
                  .build());
        }
      }
    } catch (Exception e) {
      log.warn("Failed to list android devices: {}", e.getMessage());
    }

    return devices;
  }

  /** 获取 iOS 设备列表（需要 idevice_id） */
  public List<DeviceInfo> listIosDevices() {
    List<DeviceInfo> devices = new ArrayList<>();

    try {
      // 先尝试 idevice_id（libimobiledevice）
      String output = runProcessForOutput(List.of("idevice_id", "-l"), null, 10);

      String[] lines = output.split("\n");
      for (String line : lines) {
        line = line.trim();
        if (line.isEmpty()) continue;

        String udid = line;
        // 获取设备名称
        String name = "iOS Device";
        try {
          name = runProcessForOutput(List.of("idevicename", "-u", udid), null, 5).trim();
        } catch (Exception ignored) {
        }

        devices.add(
            DeviceInfo.builder().id(udid).model(name).state("device").platform("ios").build());
      }
    } catch (Exception e) {
      log.warn("Failed to list iOS devices: {}", e.getMessage());
      // iOS 设备列表失败不是致命错误，可能用户没装 libimobiledevice
    }

    return devices;
  }

  // ==================== 私有方法 ====================

  /**
   * 查找本地 midscene 缓存目录 按优先级查找以下位置： 1. ~/.video-driven-skill/node_modules （全局缓存） 2.
   * ~/.openclaw/skills/{skill}/node_modules 3. 当前工作目录下的 node_modules
   */
  private Path findLocalMidsceneCache() {
    String homeDir = System.getProperty("user.home");

    // 1. 检查全局缓存目录
    Path globalCache = Paths.get(homeDir, ".video-driven-skill", "node_modules");
    if (hasMidscenePackage(globalCache)) {
      return globalCache;
    }

    // 2. 检查 ~/.openclaw/skills 下的技能目录
    Path openclawSkills = Paths.get(homeDir, ".openclaw", "skills");
    if (Files.exists(openclawSkills)) {
      try {
        return Files.list(openclawSkills)
            .filter(Files::isDirectory)
            .map(skillDir -> skillDir.resolve("node_modules"))
            .filter(this::hasMidscenePackage)
            .findFirst()
            .orElse(null);
      } catch (IOException e) {
        log.warn("Failed to scan openclaw skills directory", e);
      }
    }

    // 3. 检查当前工作目录
    Path cwdNodeModules = Paths.get("node_modules").toAbsolutePath();
    if (hasMidscenePackage(cwdNodeModules)) {
      return cwdNodeModules;
    }

    return null;
  }

  /** 检查目录是否包含 midscene 包 */
  private boolean hasMidscenePackage(Path nodeModules) {
    if (!Files.exists(nodeModules)) {
      return false;
    }
    // 检查是否有 @midscene 目录
    Path midsceneDir = nodeModules.resolve("@midscene");
    return Files.exists(midsceneDir) && Files.isDirectory(midsceneDir);
  }

  /** 链接本地 midscene 到临时目录 通过创建符号链接或复制文件来复用本地缓存 */
  private void linkLocalMidscene(Path tempDir, Path sourceNodeModules, Consumer<String> logConsumer)
      throws IOException {
    Path targetNodeModules = tempDir.resolve("node_modules");
    Files.createDirectories(targetNodeModules);

    Path sourceMidscene = sourceNodeModules.resolve("@midscene");
    Path targetMidscene = targetNodeModules.resolve("@midscene");

    // 检查源目录中的 midscene 包
    if (!Files.exists(sourceMidscene)) {
      throw new IOException("Source @midscene not found: " + sourceMidscene);
    }

    // 列出所有 @midscene/* 包
    List<String> linkedPackages = new ArrayList<>();
    try (var stream = Files.list(sourceMidscene)) {
      List<Path> packages = stream.filter(Files::isDirectory).toList();

      for (Path pkg : packages) {
        String pkgName = pkg.getFileName().toString();
        Path targetPkg = targetMidscene.resolve(pkgName);

        try {
          // 尝试创建符号链接
          Files.createSymbolicLink(targetPkg, pkg);
          linkedPackages.add("@midscene/" + pkgName);
        } catch (UnsupportedOperationException | IOException e) {
          // 如果不支持符号链接，则复制
          logConsumer.accept("  📋 复制 @midscene/" + pkgName + "...");
          copyDirectory(pkg, targetPkg);
          linkedPackages.add("@midscene/" + pkgName + " (copied)");
        }
      }
    }

    // 同时链接/复制一些常用依赖
    String[] commonDeps = {"zod", "openai", "dotenv", "puppeteer-core"};
    for (String dep : commonDeps) {
      Path sourceDep = sourceNodeModules.resolve(dep);
      Path targetDep = targetNodeModules.resolve(dep);
      if (Files.exists(sourceDep) && !Files.exists(targetDep)) {
        try {
          Files.createSymbolicLink(targetDep, sourceDep);
        } catch (Exception e) {
          // 忽略失败，让 npm install 处理
        }
      }
    }

    logConsumer.accept("  📦 已链接/复制: " + String.join(", ", linkedPackages));
  }

  /** 递归复制目录 */
  private void copyDirectory(Path source, Path target) throws IOException {
    Files.walk(source)
        .forEach(
            srcPath -> {
              try {
                Path relativePath = source.relativize(srcPath);
                Path targetPath = target.resolve(relativePath);
                if (Files.isDirectory(srcPath)) {
                  Files.createDirectories(targetPath);
                } else {
                  Files.copy(srcPath, targetPath, StandardCopyOption.REPLACE_EXISTING);
                }
              } catch (IOException e) {
                log.warn("Failed to copy: {}", srcPath, e);
              }
            });
  }

  private Path createTempDir(String runId) throws IOException {
    Path tempDir = Paths.get(System.getProperty("java.io.tmpdir"), "skill-run-" + runId);
    Files.createDirectories(tempDir);
    return tempDir;
  }

  private void writeSkillFiles(SkillFile skillFile, Path tempDir, Path scriptsDir)
      throws IOException {
    for (SkillFile.FileEntry file : skillFile.getFiles()) {
      Path targetPath;
      if (file.getPath().startsWith("scripts/")) {
        targetPath = scriptsDir.resolve(file.getName());
      } else {
        targetPath = tempDir.resolve(file.getName());
      }

      String content = file.getContent();

      // 修复 package.json 中的无效版本号
      if ("package.json".equals(file.getName())) {
        content = fixPackageJsonVersions(content);
      }

      Files.writeString(targetPath, content);
    }
  }

  /** 修复 package.json 中的无效版本号为有效版本号 */
  private String fixPackageJsonVersions(String content) {
    // 替换所有无效版本号为有效版本号
    // 查询时间: 2026-03-21
    // @midscene/* 最新: 1.5.6
    // puppeteer 最新: 24.40.0
    // dotenv 最新: 17.3.1
    String fixed =
        content
            // ^latest -> 有效版本
            .replace("\"@midscene/web\": \"^latest\"", "\"@midscene/web\": \"^1.5.6\"")
            .replace("\"@midscene/android\": \"^latest\"", "\"@midscene/android\": \"^1.5.6\"")
            .replace("\"@midscene/ios\": \"^latest\"", "\"@midscene/ios\": \"^1.5.6\"")
            .replace("\"@midscene/computer\": \"^latest\"", "\"@midscene/computer\": \"^1.5.6\"")
            .replace("\"puppeteer\": \"^latest\"", "\"puppeteer\": \"^24.0.0\"")
            .replace("\"dotenv\": \"^latest\"", "\"dotenv\": \"^17.0.0\"")
            // ^0.8.0 (旧版本) -> 有效版本
            .replace("\"@midscene/web\": \"^0.8.0\"", "\"@midscene/web\": \"^1.5.6\"")
            .replace("\"@midscene/android\": \"^0.8.0\"", "\"@midscene/android\": \"^1.5.6\"")
            .replace("\"@midscene/ios\": \"^0.8.0\"", "\"@midscene/ios\": \"^1.5.6\"")
            .replace("\"@midscene/computer\": \"^0.8.0\"", "\"@midscene/computer\": \"^1.5.6\"")
            // dotenv ^16.0.0 -> ^17.0.0
            .replace("\"dotenv\": \"^16.0.0\"", "\"dotenv\": \"^17.0.0\"");

    return fixed;
  }

  /** 直接启动进程（跨平台，不依赖 bash） */
  private int runProcess(
      List<String> command,
      Path workingDir,
      Map<String, String> extraEnv,
      Consumer<String> logConsumer,
      int timeout)
      throws IOException, InterruptedException {

    ProcessBuilder pb = new ProcessBuilder(command);
    if (workingDir != null) {
      pb.directory(workingDir.toFile());
    }
    pb.redirectErrorStream(true);
    Map<String, String> env = pb.environment();
    env.putAll(System.getenv());
    if (extraEnv != null) {
      env.putAll(extraEnv);
    }

    String cmdLine = String.join(" ", command);
    log.info("[SkillRunner] Executing: {}", cmdLine);
    if (logConsumer != null) {
      logConsumer.accept(
          "[系统] 执行命令: " + cmdLine.substring(0, Math.min(cmdLine.length(), 100)) + "...");
    }

    Process process = pb.start();

    Thread outputThread =
        new Thread(
            () -> {
              try (BufferedReader reader =
                  new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                  log.debug("[SkillRunner Output] {}", line);
                  if (logConsumer != null) {
                    try {
                      logConsumer.accept(line);
                    } catch (Exception e) {
                      log.warn("[SkillRunner] Error in log consumer: {}", e.getMessage());
                    }
                  }
                }
              } catch (IOException e) {
                log.warn("[SkillRunner] Error reading output: {}", e.getMessage());
              }
            });
    outputThread.setDaemon(true);
    outputThread.start();

    boolean finished = process.waitFor(timeout, TimeUnit.SECONDS);

    try {
      outputThread.join(5000);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }

    if (!finished) {
      process.destroyForcibly();
      throw new RuntimeException("Command timeout after " + timeout + "s");
    }

    int exitCode = process.exitValue();
    log.info("[SkillRunner] Command completed with exit code: {}", exitCode);
    return exitCode;
  }

  /** 直接启动进程并返回输出（不流式） */
  private String runProcessForOutput(List<String> command, Path workingDir, int timeout)
      throws IOException, InterruptedException {
    ProcessBuilder pb = new ProcessBuilder(command);
    if (workingDir != null) {
      pb.directory(workingDir.toFile());
    }
    pb.environment().putAll(System.getenv());
    pb.redirectErrorStream(true);

    Process process = pb.start();
    String output = new String(process.getInputStream().readAllBytes());

    boolean finished = process.waitFor(timeout, TimeUnit.SECONDS);
    if (!finished) {
      process.destroyForcibly();
      throw new RuntimeException("Command timeout");
    }

    return output;
  }

  private void injectInstrumentation(
      Path mainJsPath, String platform, Map<String, String> variables) throws IOException {
    if (!Files.exists(mainJsPath)) {
      return;
    }

    String content = Files.readString(mainJsPath);

    // 移除 if (require.main === module) 代码块，避免与运行器冲突
    content = removeMainBlock(content);

    // 注入监控代码到开头
    String injection = buildInstrumentationCode(platform);
    content = injection + content;

    // 在文件末尾添加执行代码（如果还没有的话）
    if (!content.contains("// === Auto-execution ===")) {
      String executor = buildExecutorCode(platform, variables);
      content = content + "\n" + executor;
    }

    Files.writeString(mainJsPath, content);
  }

  /** 移除脚本中的 if (require.main === module) 代码块 避免与 SkillRunner 的自动执行代码冲突 */
  private String removeMainBlock(String content) {
    // 匹配 if (require.main === module) { ... } 块
    // 使用简单的括号计数来处理嵌套
    String pattern = "if\\s*\\(\\s*require\\.main\s*===\s*module\s*\\)\\s*\\{";
    java.util.regex.Pattern p = java.util.regex.Pattern.compile(pattern);
    java.util.regex.Matcher m = p.matcher(content);

    StringBuilder result = new StringBuilder();
    int lastEnd = 0;

    while (m.find()) {
      // 添加匹配位置之前的内容
      result.append(content, lastEnd, m.start());

      // 找到匹配的结束大括号
      int braceCount = 1;
      int i = m.end();
      while (i < content.length() && braceCount > 0) {
        char c = content.charAt(i);
        if (c == '{') braceCount++;
        else if (c == '}') braceCount--;
        i++;
      }

      // 跳过这个块
      lastEnd = i;
    }

    // 添加剩余内容
    result.append(content, lastEnd, content.length());

    return result.toString();
  }

  /** 构建执行代码，调用 main 函数并传入变量 */
  private String buildExecutorCode(String platform, Map<String, String> variables) {
    // 将变量转换为 JSON 字符串
    String variablesJson = "{}";
    if (variables != null && !variables.isEmpty()) {
      try {
        variablesJson = objectMapper.writeValueAsString(variables);
      } catch (Exception e) {
        log.warn("Failed to serialize variables", e);
      }
    }

    if ("android".equals(platform) || "ios".equals(platform)) {
      return "\n"
          + "// === Auto-execution ===\n"
          + "(async () => {\n"
          + "    try {\n"
          + "        const deviceId = process.env.DEVICE_ID;\n"
          + "        if (!deviceId) {\n"
          + "            console.error('[SKILL_LOG] ERROR: DEVICE_ID environment variable not set');\n"
          + "            process.exit(1);\n"
          + "        }\n"
          + "        console.log('[SKILL_LOG] Starting skill on device: ' + deviceId);\n"
          + "        const variables = "
          + variablesJson
          + ";\n"
          + "        console.log('[SKILL_LOG] Variables:', JSON.stringify(variables));\n"
          + "        for (const [key, value] of Object.entries(variables)) {\n"
          + "            if (value !== undefined && value !== null) process.env[key] = String(value);\n"
          + "        }\n"
          + "        const result = await main(deviceId, variables);\n"
          + "        console.log('[SKILL_LOG] Skill completed successfully');\n"
          + "        console.log('[SKILL_LOG] Result:', JSON.stringify(result, null, 2));\n"
          + "        process.exit(0);\n"
          + "    } catch (error) {\n"
          + "        console.error('[SKILL_LOG] Skill failed:', error.message);\n"
          + "        console.error(error.stack);\n"
          + "        process.exit(1);\n"
          + "    }\n"
          + "})();\n";
    } else {
      return "\n"
          + "// === Auto-execution ===\n"
          + "(async () => {\n"
          + "    try {\n"
          + "        console.log('[SKILL_LOG] Starting skill...');\n"
          + "        const variables = "
          + variablesJson
          + ";\n"
          + "        console.log('[SKILL_LOG] Variables:', JSON.stringify(variables));\n"
          + "        for (const [key, value] of Object.entries(variables)) {\n"
          + "            if (value !== undefined && value !== null) process.env[key] = String(value);\n"
          + "        }\n"
          + "        \n"
          + "        // 尝试获取 Chrome 调试端点\n"
          + "        let browserWSEndpoint = 'ws://127.0.0.1:9222/devtools/browser';\n"
          + "        try {\n"
          + "            const http = require('http');\n"
          + "            const versionUrl = 'http://127.0.0.1:9222/json/version';\n"
          + "            const versionData = await new Promise((resolve, reject) => {\n"
          + "                http.get(versionUrl, (res) => {\n"
          + "                    let data = '';\n"
          + "                    res.on('data', chunk => data += chunk);\n"
          + "                    res.on('end', () => resolve(data));\n"
          + "                }).on('error', reject);\n"
          + "            });\n"
          + "            const version = JSON.parse(versionData);\n"
          + "            if (version.webSocketDebuggerUrl) {\n"
          + "                browserWSEndpoint = version.webSocketDebuggerUrl;\n"
          + "                console.log('[SKILL_LOG] Found Chrome debug endpoint: ' + browserWSEndpoint);\n"
          + "            }\n"
          + "        } catch (e) {\n"
          + "            console.log('[SKILL_LOG] Using default Chrome debug endpoint');\n"
          + "        }\n"
          + "        \n"
          + "        // 将端点传递给 main 函数\n"
          + "        variables._browserWSEndpoint = browserWSEndpoint;\n"
          + "        \n"
          + "        const result = await main(variables);\n"
          + "        console.log('[SKILL_LOG] Skill completed successfully');\n"
          + "        console.log('[SKILL_LOG] Result:', JSON.stringify(result, null, 2));\n"
          + "        process.exit(0);\n"
          + "    } catch (error) {\n"
          + "        console.error('[SKILL_LOG] Skill failed:', error.message);\n"
          + "        console.error(error.stack);\n"
          + "        process.exit(1);\n"
          + "    }\n"
          + "})();\n";
    }
  }

  /**
   * 构建运行时知识库加载代码： 1. 扫描 ./knowledge/ 目录 2. 读取 knowledge.json 元数据 3. 文本文件 → 拼接为 context 字符串 4. 图片文件
   * → 转 base64，构造成 midscene 接受的 { name, url } 格式 5. 暴露 globalThis.__KNOWLEDGE__ = { context, texts,
   * images }
   */
  private String buildKnowledgeLoaderCode() {
    return "// === Knowledge Base Loader ===\n"
        + "(function loadKnowledge(){\n"
        + "    const _kbDir = _skillPath.join(process.cwd(), 'knowledge');\n"
        + "    const kb = { context: '', texts: [], images: [] };\n"
        + "    try {\n"
        + "        if (!_skillFs.existsSync(_kbDir)) { globalThis.__KNOWLEDGE__ = kb; return; }\n"
        + "        let manifest = [];\n"
        + "        const manifestPath = _skillPath.join(_kbDir, 'knowledge.json');\n"
        + "        if (_skillFs.existsSync(manifestPath)) {\n"
        + "            try { manifest = JSON.parse(_skillFs.readFileSync(manifestPath, 'utf8')); } catch (e) {}\n"
        + "        }\n"
        + "        const metaOf = (name) => manifest.find(m => m && m.fileName === name) || {};\n"
        + "        const imgExts = new Set(['.jpg','.jpeg','.png','.gif','.webp','.bmp']);\n"
        + "        const txtExts = new Set(['.md','.txt','.json','.csv','.yml','.yaml','.html','.htm']);\n"
        + "        const mimeOf = (ext) => ({ '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.bmp':'image/bmp' }[ext] || 'image/png');\n"
        + "        const files = _skillFs.readdirSync(_kbDir).filter(f => f !== 'knowledge.json');\n"
        + "        const parts = [];\n"
        + "        for (const name of files) {\n"
        + "            const full = _skillPath.join(_kbDir, name);\n"
        + "            const stat = _skillFs.statSync(full);\n"
        + "            if (!stat.isFile()) continue;\n"
        + "            const ext = _skillPath.extname(name).toLowerCase();\n"
        + "            const meta = metaOf(name);\n"
        + "            const desc = meta.description || '';\n"
        + "            if (txtExts.has(ext)) {\n"
        + "                try {\n"
        + "                    const content = _skillFs.readFileSync(full, 'utf8');\n"
        + "                    kb.texts.push({ name, description: desc, content });\n"
        + "                    const header = desc ? `[文档: ${name}] ${desc}` : `[文档: ${name}]`;\n"
        + "                    parts.push(header + '\\n' + content);\n"
        + "                } catch (e) {\n"
        + "                    console.log('[SKILL_LOG] Read text failed: ' + name);\n"
        + "                }\n"
        + "            } else if (imgExts.has(ext)) {\n"
        + "                try {\n"
        + "                    const buf = _skillFs.readFileSync(full);\n"
        + "                    const url = 'data:' + mimeOf(ext) + ';base64,' + buf.toString('base64');\n"
        + "                    kb.images.push({ name: desc || name, url, fileName: name, description: desc });\n"
        + "                    const header = desc ? `[图片: ${name}] ${desc}` : `[图片: ${name}]`;\n"
        + "                    parts.push(header + ' — 可通过 globalThis.__KNOWLEDGE__.images 引用传入 aiTap/aiAssert 的 images 参数');\n"
        + "                } catch (e) {\n"
        + "                    console.log('[SKILL_LOG] Read image failed: ' + name);\n"
        + "                }\n"
        + "            } else {\n"
        + "                const header = desc ? `[附件: ${name}] ${desc}` : `[附件: ${name}]`;\n"
        + "                parts.push(header);\n"
        + "            }\n"
        + "        }\n"
        + "        if (parts.length > 0) {\n"
        + "            kb.context = '以下是本任务的参考知识库（背景信息，请结合实际页面使用）：\\n\\n' + parts.join('\\n\\n---\\n\\n');\n"
        + "            console.log('[SKILL_LOG] 📚 Knowledge loaded: ' + kb.texts.length + ' docs, ' + kb.images.length + ' images');\n"
        + "        }\n"
        + "    } catch (e) {\n"
        + "        console.log('[SKILL_LOG] Knowledge load error: ' + e.message);\n"
        + "    }\n"
        + "    globalThis.__KNOWLEDGE__ = kb;\n"
        + "})();\n";
  }

  private String buildInstrumentationCode(String platform) {
    // 使用无缩进的字符串，避免 JS 语法错误
    // 使用全局对象检查，避免与脚本中的 fs/path 重复声明
    return "// === Video Driven Skill Runtime Injection ===\n"
        + "const _skillFs = global.fs || require('fs');\n"
        + "const _skillPath = global.path || require('path');\n"
        + "let _stepCount = 0;\n"
        + "const _screenshotDir = process.cwd();\n"
        + "\n"
        + buildKnowledgeLoaderCode()
        + "\n"
        + "async function _skillScreenshot(agent, label) {\n"
        + "    try {\n"
        + "        let page = null;\n"
        + "        if (agent && agent.page) page = agent.page;\n"
        + "        else if (agent && agent.driver) page = agent.driver;\n"
        + "        \n"
        + "        if (page && page.screenshot) {\n"
        + "            const screenshot = await page.screenshot({ \n"
        + "                encoding: 'base64',\n"
        + "                fullPage: false \n"
        + "            });\n"
        + "            const filename = `_skill_${label}_${Date.now()}.txt`;\n"
        + "            _skillFs.writeFileSync(_skillPath.join(_screenshotDir, filename), screenshot);\n"
        + "            console.log('[SKILL_SCREENSHOT]' + label + '|' + filename);\n"
        + "        }\n"
        + "    } catch (e) {\n"
        + "        console.log('[SKILL_LOG] Screenshot failed: ' + e.message);\n"
        + "    }\n"
        + "}\n"
        + "\n"
        + "function _wrapAgent(agent) {\n"
        + "    try {\n"
        + "        const kb = globalThis.__KNOWLEDGE__;\n"
        + "        if (kb && kb.context) {\n"
        + "            if (typeof agent.setAIActContext === 'function') {\n"
        + "                agent.setAIActContext(kb.context);\n"
        + "                console.log('[SKILL_LOG] 📚 agent.setAIActContext applied (' + kb.context.length + ' chars)');\n"
        + "            } else if (typeof agent.setAIActionContext === 'function') {\n"
        + "                agent.setAIActionContext(kb.context);\n"
        + "                console.log('[SKILL_LOG] 📚 agent.setAIActionContext applied (legacy API)');\n"
        + "            }\n"
        + "        }\n"
        + "    } catch (e) {\n"
        + "        console.log('[SKILL_LOG] Knowledge context injection failed: ' + e.message);\n"
        + "    }\n"
        + "    const methods = ['aiAct', 'aiTap', 'aiInput', 'aiScroll', 'aiQuery', 'aiAssert', 'aiWaitFor'];\n"
        + "    methods.forEach(method => {\n"
        + "        if (agent[method]) {\n"
        + "            const original = agent[method].bind(agent);\n"
        + "            agent[method] = async function(...args) {\n"
        + "                _stepCount++;\n"
        + "                const desc = args[0] ? args[0].toString().substring(0, 50) : '';\n"
        + "                console.log(`[SKILL_STEP] ${_stepCount}: ${method} - ${desc}`);\n"
        + "                const result = await original(...args);\n"
        + "                await _skillScreenshot(agent, `step-${_stepCount}`);\n"
        + "                return result;\n"
        + "            };\n"
        + "        }\n"
        + "    });\n"
        + "    return agent;\n"
        + "}\n"
        + "\n"
        + "const Module = require('module');\n"
        + "const originalRequire = Module.prototype.require;\n"
        + "Module.prototype.require = function(id) {\n"
        + "    const mod = originalRequire.apply(this, arguments);\n"
        + "    \n"
        + "    if (id === '@midscene/web/puppeteer' && mod.PuppeteerAgent) {\n"
        + "        const Original = mod.PuppeteerAgent;\n"
        + "        mod.PuppeteerAgent = class extends Original {\n"
        + "            constructor(page, opts) {\n"
        + "                const merged = Object.assign({}, opts || {});\n"
        + "                const kb = globalThis.__KNOWLEDGE__;\n"
        + "                if (kb && kb.context) {\n"
        + "                    merged.aiActContext = merged.aiActContext\n"
        + "                        ? merged.aiActContext + '\\n\\n' + kb.context\n"
        + "                        : kb.context;\n"
        + "                }\n"
        + "                super(page, merged);\n"
        + "                _wrapAgent(this);\n"
        + "            }\n"
        + "        };\n"
        + "    }\n"
        + "    \n"
        + "    if (id === '@midscene/android' && mod.agentFromAdbDevice) {\n"
        + "        const original = mod.agentFromAdbDevice;\n"
        + "        mod.agentFromAdbDevice = async function(...args) {\n"
        + "            const agent = await original.apply(this, args);\n"
        + "            _wrapAgent(agent);\n"
        + "            return agent;\n"
        + "        };\n"
        + "    }\n"
        + "    \n"
        + "    if (id === '@midscene/ios' && mod.agentFromWebDriverAgent) {\n"
        + "        const original = mod.agentFromWebDriverAgent;\n"
        + "        mod.agentFromWebDriverAgent = async function(...args) {\n"
        + "            const agent = await original.apply(this, args);\n"
        + "            _wrapAgent(agent);\n"
        + "            return agent;\n"
        + "        };\n"
        + "    }\n"
        + "    \n"
        + "    return mod;\n"
        + "};\n"
        + "// === Injection End ===\n\n";
  }

  private RunResult executeScript(Path tempDir, RunOptions options, Consumer<String> logConsumer) {
    List<String> logs = new ArrayList<>();

    Map<String, String> env = new HashMap<>();
    env.put("NODE_ENV", "test");
    env.put("HEADLESS", String.valueOf(options.isHeadless()));

    if (options.getTargetUrl() != null) {
      env.put("TARGET_URL", options.getTargetUrl());
    }

    if (options.getDeviceId() != null) {
      env.put("DEVICE_ID", options.getDeviceId());
    }

    if (options.getVariables() != null) {
      options
          .getVariables()
          .forEach(
              (key, value) -> {
                if (key != null && value != null) {
                  env.put(key, value);
                }
              });
    }

    List<String> command = List.of("node", "scripts/main.js");

    int effectiveTimeout =
        (options.getTimeoutSeconds() != null && options.getTimeoutSeconds() > 0)
            ? options.getTimeoutSeconds()
            : timeoutSeconds;
    logConsumer.accept(
        "[系统] 开始执行脚本，超时时间: "
            + effectiveTimeout
            + "秒"
            + (options.getTimeoutSeconds() != null ? "（本次自定义）" : "（默认）"));

    try {
      int exitCode =
          runProcess(
              command,
              tempDir,
              env,
              line -> {
                logs.add(line);
                parseAndForwardLog(line, logConsumer);
              },
              effectiveTimeout);

      boolean success = exitCode == 0;
      logConsumer.accept("[系统] 脚本执行完成，退出码: " + exitCode);

      // 尝试从日志中提取 JSON 结果
      String resultData = extractResultFromLogs(logs);

      return RunResult.builder()
          .success(success)
          .exitCode(exitCode)
          .logs(logs)
          .data(resultData)
          .build();

    } catch (Exception e) {
      log.error("[SkillRunner] Script execution failed", e);
      logConsumer.accept("[系统错误] " + e.getMessage());
      return RunResult.builder()
          .success(false)
          .exitCode(-1)
          .logs(logs)
          .error(e.getMessage())
          .build();
    }
  }

  private void parseAndForwardLog(String line, Consumer<String> logConsumer) {
    // 保留原始日志用于调试
    log.debug("[SkillRunner Parse] {}", line);

    if (line.startsWith("[SKILL_STEP]")) {
      logConsumer.accept("🎯 步骤 " + line.substring(12));
    } else if (line.startsWith("[SKILL_SCREENSHOT]")) {
      // 截图已保存，内部使用
      log.debug("Screenshot saved: {}", line);
    } else if (line.startsWith("[SKILL_LOG]")) {
      logConsumer.accept("ℹ️ " + line.substring(11));
    } else if (line.contains("aiTap") || line.contains("aiAct") || line.contains("aiInput")) {
      // 检测到 AI 操作，高亮显示
      logConsumer.accept("🤖 AI: " + line);
    } else if (line.toLowerCase().contains("error") || line.toLowerCase().contains("错误")) {
      logConsumer.accept("❌ " + line);
    } else {
      // 普通日志
      logConsumer.accept(line);
    }
  }

  /** 从日志中提取 JSON 结果 查找 [SKILL_LOG] Result: 后面的 JSON 数据 */
  private String extractResultFromLogs(List<String> logs) {
    // 首先查找 [SKILL_LOG] Result: 格式的输出
    for (int i = logs.size() - 1; i >= 0; i--) {
      String line = logs.get(i);
      String resultPrefix = "[SKILL_LOG] Result:";
      int resultIndex = line.indexOf(resultPrefix);

      if (resultIndex >= 0) {
        // 提取 Result: 后面的 JSON 字符串
        String jsonStr = line.substring(resultIndex + resultPrefix.length()).trim();
        if (jsonStr.startsWith("{") && jsonStr.endsWith("}")) {
          return jsonStr;
        }
        // 如果 JSON 跨多行，尝试收集
        if (jsonStr.startsWith("{")) {
          StringBuilder fullJson = new StringBuilder(jsonStr);
          int braceCount = countBraces(jsonStr);
          int j = i + 1;
          while (j < logs.size() && braceCount > 0) {
            String nextLine = logs.get(j);
            fullJson.append(nextLine);
            braceCount += countBraces(nextLine);
            j++;
          }
          if (braceCount == 0) {
            return fullJson.toString();
          }
        }
      }
    }

    // 备选：查找任何包含 success 字段的 JSON 对象（兼容旧格式）
    StringBuilder jsonBuilder = new StringBuilder();
    boolean inJson = false;
    int braceCount = 0;

    for (int i = logs.size() - 1; i >= 0; i--) {
      String line = logs.get(i);

      // 从后向前查找 JSON 结束标记
      if (!inJson && line.trim().endsWith("}")) {
        inJson = true;
      }

      if (inJson) {
        jsonBuilder.insert(0, line);

        // 计算大括号数量
        for (char c : line.toCharArray()) {
          if (c == '}') braceCount++;
          if (c == '{') braceCount--;
        }

        // 找到 JSON 开始
        if (braceCount == 0) {
          String jsonStr = jsonBuilder.toString().trim();
          if (jsonStr.startsWith("{") && jsonStr.contains("success")) {
            return jsonStr;
          }
          break;
        }
      }
    }

    return null;
  }

  /** 计算字符串中大括号的净数量（{ 为 +1，} 为 -1） */
  private int countBraces(String str) {
    int count = 0;
    for (char c : str.toCharArray()) {
      if (c == '{') count++;
      if (c == '}') count--;
    }
    return count;
  }

  private List<RunResult.Screenshot> collectScreenshots(Path tempDir) {
    List<RunResult.Screenshot> screenshots = new ArrayList<>();

    try {
      Files.list(tempDir)
          .filter(p -> p.getFileName().toString().startsWith("_skill_"))
          .sorted()
          .forEach(
              p -> {
                try {
                  String filename = p.getFileName().toString();
                  // _skill_step-1_123456789.txt
                  String label = filename.replace("_skill_", "").replaceAll("_\\d+\\.txt$", "");
                  String base64 = Files.readString(p);

                  screenshots.add(
                      RunResult.Screenshot.builder()
                          .label(label)
                          .base64Image(base64)
                          .timestamp(System.currentTimeMillis())
                          .build());
                } catch (IOException e) {
                  log.warn("Failed to read screenshot: {}", p, e);
                }
              });
    } catch (IOException e) {
      log.warn("Failed to collect screenshots", e);
    }

    return screenshots;
  }

  private void cleanup(Path tempDir) {
    try {
      Files.walk(tempDir)
          .sorted((a, b) -> -a.compareTo(b))
          .forEach(
              p -> {
                try {
                  Files.delete(p);
                } catch (IOException ignored) {
                }
              });
    } catch (IOException ignored) {
    }
  }

  private RunResult buildErrorResult(long startTime, int exitCode, String error) {
    return RunResult.builder()
        .success(false)
        .exitCode(exitCode)
        .logs(List.of())
        .error(error)
        .durationMs(System.currentTimeMillis() - startTime)
        .build();
  }

  private String extractValue(String line, String key) {
    int start = line.indexOf(key);
    if (start >= 0) {
      int end = line.indexOf(" ", start);
      if (end < 0) end = line.length();
      return line.substring(start + key.length(), end);
    }
    return null;
  }

  private static boolean isWindows() {
    String os = System.getProperty("os.name", "");
    return os.toLowerCase().contains("win");
  }

  private List<String> npmCommand(String... args) {
    List<String> cmd = new ArrayList<>();
    if (isWindows()) {
      cmd.add("cmd.exe");
      cmd.add("/c");
      cmd.add("npm");
    } else {
      cmd.add("npm");
    }
    cmd.addAll(Arrays.asList(args));
    return cmd;
  }
}
