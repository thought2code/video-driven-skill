package io.videodrivenskill.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.videodrivenskill.controller.SkillController;
import io.videodrivenskill.model.GenerateSkillRequest;
import io.videodrivenskill.model.SkillFile;
import io.videodrivenskill.model.SkillRecord;
import io.videodrivenskill.model.SkillVersion;
import io.videodrivenskill.repository.SkillRepository;
import io.videodrivenskill.repository.SkillVersionRepository;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Slf4j
@Service
@RequiredArgsConstructor
public class SkillService {

  @Value("${app.skills-dir}")
  private String skillsDir;

  private final AIService aiService;
  private final SkillRepository skillRepository;
  private final SkillVersionRepository skillVersionRepository;
  private final ObjectMapper objectMapper = new ObjectMapper();

  @SuppressWarnings("unchecked")
  public SkillFile generateSkill(GenerateSkillRequest request, Consumer<String> logger)
      throws IOException {
    Map<String, Object> aiResult = aiService.generateSkill(request, logger);

    String skillName = (String) aiResult.get("skillName");
    String platform = (String) aiResult.getOrDefault("platform", "browser");
    String skillMd = (String) aiResult.get("skillMd");
    String packageJson = (String) aiResult.getOrDefault("packageJson", "");
    List<Map<String, String>> scripts = (List<Map<String, String>>) aiResult.get("scripts");
    List<Map<String, String>> variablesData = (List<Map<String, String>>) aiResult.get("variables");

    String skillId = UUID.randomUUID().toString();
    logger.accept("🎯 检测平台：" + platform);
    logger.accept("💾 保存 Skill 文件，ID：" + skillId);

    Path skillPath = Paths.get(skillsDir, skillId);
    Files.createDirectories(skillPath);
    Files.createDirectories(skillPath.resolve("scripts"));
    Files.writeString(skillPath.resolve("SKILL.md"), skillMd);

    List<SkillFile.FileEntry> fileEntries = new ArrayList<>();
    fileEntries.add(
        SkillFile.FileEntry.builder().name("SKILL.md").path("SKILL.md").content(skillMd).build());

    // 生成或保存 package.json
    String packageJsonContent =
        packageJson.isEmpty() ? generateDefaultPackageJson(skillName, platform) : packageJson;
    Files.writeString(skillPath.resolve("package.json"), packageJsonContent);
    fileEntries.add(
        SkillFile.FileEntry.builder()
            .name("package.json")
            .path("package.json")
            .content(packageJsonContent)
            .build());
    logger.accept("📄 生成文件：package.json");

    for (Map<String, String> script : scripts) {
      String scriptName = script.get("name");
      String scriptContent = script.get("content");
      Files.writeString(skillPath.resolve("scripts").resolve(scriptName), scriptContent);
      fileEntries.add(
          SkillFile.FileEntry.builder()
              .name(scriptName)
              .path("scripts/" + scriptName)
              .content(scriptContent)
              .build());
      logger.accept("📄 生成文件：scripts/" + scriptName);
    }

    // 保存变量定义
    List<SkillFile.SkillVariable> variables = new ArrayList<>();
    if (variablesData != null) {
      for (Map<String, String> varData : variablesData) {
        if (varData.get("name") != null && !varData.get("name").isEmpty()) {
          variables.add(
              SkillFile.SkillVariable.builder()
                  .name(varData.get("name"))
                  .label(varData.get("label"))
                  .defaultValue(varData.get("defaultValue"))
                  .type(varData.getOrDefault("type", "string"))
                  .build());
          logger.accept("🔧 抽取变量：" + varData.get("label") + " (" + varData.get("name") + ")");
        }
      }
    }

    // 保存变量到 JSON 文件
    if (!variables.isEmpty()) {
      String variablesJson = objectMapper.writeValueAsString(variables);
      Files.writeString(skillPath.resolve("variables.json"), variablesJson);
      fileEntries.add(
          SkillFile.FileEntry.builder()
              .name("variables.json")
              .path("variables.json")
              .content(variablesJson)
              .build());
    }

    // 保存关联的视频ID和帧信息
    String videoId = request.getVideoId();
    String framesJson = null;
    if (request.getFrames() != null && !request.getFrames().isEmpty()) {
      // 保存帧信息（包含 base64 图片）
      framesJson = objectMapper.writeValueAsString(request.getFrames());
      logger.accept("🔗 关联视频: " + videoId + ", " + request.getFrames().size() + " 帧");
    }

    skillRepository.save(
        SkillRecord.builder()
            .skillId(skillId)
            .skillName(skillName)
            .platform(platform)
            .displayOrder(nextDisplayOrder())
            .videoId(videoId)
            .framesJson(framesJson)
            .requirement(request.getRequirement())
            .variablesJson(objectMapper.writeValueAsString(variables))
            .createdAt(LocalDateTime.now())
            .build());

    logger.accept("✨ Skill 生成完成：" + skillName);
    return SkillFile.builder()
        .skillId(skillId)
        .skillName(skillName)
        .files(fileEntries)
        .variables(variables)
        .build();
  }

  public List<SkillRecord> listSkills() {
    List<SkillRecord> skills = skillRepository.findAll();
    skills.sort(
        Comparator.comparing(
                (SkillRecord skill) ->
                    skill.getDisplayOrder() == null ? Integer.MAX_VALUE : skill.getDisplayOrder())
            .thenComparing(
                SkillRecord::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())));
    return skills;
  }

  @Transactional
  public void reorderSkills(List<String> orderedSkillIds) {
    if (orderedSkillIds == null || orderedSkillIds.isEmpty()) return;

    Map<String, SkillRecord> byId =
        skillRepository.findAll().stream()
            .collect(Collectors.toMap(SkillRecord::getSkillId, skill -> skill));

    int index = 0;
    for (String skillId : orderedSkillIds) {
      SkillRecord skill = byId.get(skillId);
      if (skill == null) continue;
      skill.setDisplayOrder(index++);
      skillRepository.save(skill);
    }
  }

  public SkillFile getSkill(String skillId) throws IOException {
    Path skillPath = Paths.get(skillsDir, skillId);
    if (!Files.exists(skillPath)) throw new FileNotFoundException("Skill not found: " + skillId);

    List<SkillFile.FileEntry> fileEntries = new ArrayList<>();
    Path skillMdPath = skillPath.resolve("SKILL.md");
    if (Files.exists(skillMdPath)) {
      fileEntries.add(
          SkillFile.FileEntry.builder()
              .name("SKILL.md")
              .path("SKILL.md")
              .content(Files.readString(skillMdPath))
              .build());
    }
    Path packageJsonPath = skillPath.resolve("package.json");
    if (Files.exists(packageJsonPath)) {
      fileEntries.add(
          SkillFile.FileEntry.builder()
              .name("package.json")
              .path("package.json")
              .content(Files.readString(packageJsonPath))
              .build());
    }
    Path scriptsPath = skillPath.resolve("scripts");
    if (Files.exists(scriptsPath)) {
      Files.list(scriptsPath)
          .forEach(
              p -> {
                try {
                  fileEntries.add(
                      SkillFile.FileEntry.builder()
                          .name(p.getFileName().toString())
                          .path("scripts/" + p.getFileName().toString())
                          .content(Files.readString(p))
                          .build());
                } catch (IOException e) {
                  log.error("Failed to read script: {}", p, e);
                }
              });
    }

    // 读取变量定义：磁盘 → DB → main.js 自动提取
    List<SkillFile.SkillVariable> variables = new ArrayList<>();
    Path variablesPath = skillPath.resolve("variables.json");
    Optional<SkillRecord> recordOpt = skillRepository.findById(skillId);
    if (Files.exists(variablesPath)) {
      try {
        String variablesJson = Files.readString(variablesPath);
        variables =
            objectMapper.readValue(
                variablesJson, new TypeReference<List<SkillFile.SkillVariable>>() {});
      } catch (IOException e) {
        log.warn("Failed to read variables.json for skill: {}", skillId);
      }
    }
    if (variables.isEmpty()
        && recordOpt.isPresent()
        && recordOpt.get().getVariablesJson() != null
        && !recordOpt.get().getVariablesJson().isEmpty()) {
      try {
        variables =
            objectMapper.readValue(
                recordOpt.get().getVariablesJson(),
                new TypeReference<List<SkillFile.SkillVariable>>() {});
        if (!variables.isEmpty()) {
          // 回写到磁盘，保持两端一致
          Files.writeString(variablesPath, recordOpt.get().getVariablesJson());
          log.info(
              "Restored variables.json from DB for skill: {} ({} vars)", skillId, variables.size());
        }
      } catch (IOException e) {
        log.warn("Failed to parse DB variables_json for skill: {}", skillId);
      }
    }
    if (variables.isEmpty()) {
      // 最后兜底：扫描 main.js 中的 process.env.XXX
      Path mainJs = skillPath.resolve("scripts").resolve("main.js");
      if (Files.exists(mainJs)) {
        variables = extractVariablesFromCode(Files.readString(mainJs));
        if (!variables.isEmpty()) {
          String json = objectMapper.writeValueAsString(variables);
          Files.writeString(variablesPath, json);
          if (recordOpt.isPresent()) {
            recordOpt.get().setVariablesJson(json);
            skillRepository.save(recordOpt.get());
          }
          log.info(
              "Auto-extracted {} variables from main.js for skill: {}", variables.size(), skillId);
        }
      }
    }
    variables = enrichVariablesFromSkillMd(skillPath, variables);
    if (recordOpt.isPresent()) {
      persistVariables(skillPath, recordOpt.get(), variables);
    }
    if (!variables.isEmpty()) {
      fileEntries.add(
          SkillFile.FileEntry.builder()
              .name("variables.json")
              .path("variables.json")
              .content(objectMapper.writeValueAsString(variables))
              .build());
    }

    // 从数据库读取关联的视频ID和帧信息
    String videoId = null;
    List<SkillFile.FrameInfo> frames = null;
    String requirement = null;
    if (recordOpt.isPresent()) {
      SkillRecord record = recordOpt.get();
      videoId = record.getVideoId();
      requirement = record.getRequirement();

      if (record.getFramesJson() != null && !record.getFramesJson().isEmpty()) {
        try {
          frames =
              objectMapper.readValue(
                  record.getFramesJson(), new TypeReference<List<SkillFile.FrameInfo>>() {});
        } catch (Exception e) {
          log.warn("Failed to parse frames json for skill: {}", skillId);
        }
      }
    }

    return SkillFile.builder()
        .skillId(skillId)
        .skillName(extractSkillName(skillPath))
        .files(fileEntries)
        .variables(variables)
        .videoId(videoId)
        .frames(frames)
        .requirement(requirement)
        .build();
  }

  public void updateFile(String skillId, String filePath, String content) throws IOException {
    Path skillPath = Paths.get(skillsDir, skillId);
    if (!Files.exists(skillPath)) throw new FileNotFoundException("Skill not found: " + skillId);
    Path targetFile = skillPath.resolve(filePath);
    Files.createDirectories(targetFile.getParent());
    Files.writeString(targetFile, content);
  }

  public byte[] exportZip(String skillId) throws IOException {
    Path skillPath = Paths.get(skillsDir, skillId);
    if (!Files.exists(skillPath)) throw new FileNotFoundException("Skill not found: " + skillId);
    String skillName = extractSkillName(skillPath);
    ByteArrayOutputStream baos = new ByteArrayOutputStream();
    try (var zos = new java.util.zip.ZipOutputStream(baos)) {
      Files.walk(skillPath)
          .filter(p -> !Files.isDirectory(p))
          .forEach(
              file -> {
                try {
                  zos.putNextEntry(
                      new java.util.zip.ZipEntry(skillName + "/" + skillPath.relativize(file)));
                  Files.copy(file, zos);
                  zos.closeEntry();
                } catch (IOException e) {
                  log.error("Failed to add file to ZIP: {}", file, e);
                }
              });
    }
    return baos.toByteArray();
  }

  /** 从 ZIP 包导入 Skill 支持的 ZIP 格式：本项目 exportZip 导出的格式（顶层为 skillName/ 目录）或无顶层目录 自动识别并剥离单一顶层目录 */
  @Transactional
  public SkillFile importSkillFromZip(MultipartFile zipFile) throws IOException {
    if (zipFile == null || zipFile.isEmpty()) {
      throw new IllegalArgumentException("ZIP 文件为空");
    }

    String skillId = UUID.randomUUID().toString();
    Path skillPath = Paths.get(skillsDir, skillId);
    Files.createDirectories(skillPath);

    try {
      // 1. 先把 ZIP 解压到临时位置以便探测顶层目录
      Path tempDir = Files.createTempDirectory("skill-import-");
      try {
        extractZip(zipFile, tempDir);

        // 2. 探测是否有单一顶层目录
        Path contentRoot = detectContentRoot(tempDir);
        log.info("Importing skill from ZIP, content root: {}", contentRoot);

        // 3. 校验必须包含 SKILL.md 或 scripts/main.js
        Path skillMdPath = contentRoot.resolve("SKILL.md");
        Path mainJsPath = contentRoot.resolve("scripts").resolve("main.js");
        if (!Files.exists(skillMdPath) && !Files.exists(mainJsPath)) {
          throw new IllegalArgumentException("无效的 Skill 包：缺少 SKILL.md 或 scripts/main.js");
        }

        // 4. 拷贝到目标目录
        Path finalContentRoot = contentRoot;
        Files.walk(contentRoot)
            .forEach(
                src -> {
                  try {
                    Path rel = finalContentRoot.relativize(src);
                    if (rel.toString().isEmpty()) return;
                    Path dst = skillPath.resolve(rel.toString());
                    if (Files.isDirectory(src)) {
                      Files.createDirectories(dst);
                    } else {
                      Files.createDirectories(dst.getParent());
                      Files.copy(src, dst, StandardCopyOption.REPLACE_EXISTING);
                    }
                  } catch (IOException e) {
                    throw new RuntimeException("Failed to copy file: " + src, e);
                  }
                });
      } finally {
        // 清理临时目录
        if (Files.exists(tempDir)) {
          Files.walk(tempDir)
              .sorted(Comparator.reverseOrder())
              .forEach(
                  p -> {
                    try {
                      Files.delete(p);
                    } catch (IOException ignored) {
                    }
                  });
        }
      }

      // 5. 解析 SKILL.md 提取元信息
      String skillName = extractSkillName(skillPath);
      String platform = extractMetadata(skillPath, "platform", "browser");
      String description = extractMetadata(skillPath, "description", "");

      // 6. 构建 FileEntry 列表（只读取文本文件，不包含 knowledge/）
      List<SkillFile.FileEntry> fileEntries = collectFileEntries(skillPath);

      // 7. 读取 variables.json（如果存在），否则从 main.js 自动提取
      List<SkillFile.SkillVariable> variables = new ArrayList<>();
      Path variablesPath = skillPath.resolve("variables.json");
      if (Files.exists(variablesPath)) {
        try {
          String variablesJson = Files.readString(variablesPath);
          variables =
              objectMapper.readValue(
                  variablesJson, new TypeReference<List<SkillFile.SkillVariable>>() {});
        } catch (Exception e) {
          log.warn("Failed to parse variables.json in imported skill: {}", e.getMessage());
        }
      }
      if (variables.isEmpty()) {
        Path importedMainJs = skillPath.resolve("scripts").resolve("main.js");
        if (Files.exists(importedMainJs)) {
          variables = extractVariablesFromCode(Files.readString(importedMainJs));
          if (!variables.isEmpty()) {
            Files.writeString(variablesPath, objectMapper.writeValueAsString(variables));
            log.info(
                "Auto-extracted {} variables from main.js for imported skill", variables.size());
          }
        }
      }
      variables = enrichVariablesFromSkillMd(skillPath, variables);

      // 8. 保存数据库记录
      String filesJson = objectMapper.writeValueAsString(fileEntries);
      String variablesJson = objectMapper.writeValueAsString(variables);

      skillRepository.save(
          SkillRecord.builder()
              .skillId(skillId)
              .skillName(skillName)
              .platform(platform)
              .displayOrder(nextDisplayOrder())
              .description(description)
              .filesJson(filesJson)
              .variablesJson(variablesJson)
              .currentVersion(1)
              .regenerationCount(0)
              .createdAt(LocalDateTime.now())
              .build());

      log.info("Skill imported successfully: {} ({})", skillName, skillId);

      return SkillFile.builder()
          .skillId(skillId)
          .skillName(skillName)
          .files(fileEntries)
          .variables(variables)
          .build();
    } catch (Exception e) {
      // 出错时清理已创建的 skill 目录
      if (Files.exists(skillPath)) {
        try {
          Files.walk(skillPath)
              .sorted(Comparator.reverseOrder())
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
      if (e instanceof IOException) throw (IOException) e;
      if (e instanceof IllegalArgumentException) throw (IllegalArgumentException) e;
      throw new IOException("导入失败: " + e.getMessage(), e);
    }
  }

  /** 安全地解压 ZIP 到目标目录（防止 Zip Slip） */
  private void extractZip(MultipartFile zipFile, Path targetDir) throws IOException {
    try (ZipInputStream zis = new ZipInputStream(zipFile.getInputStream())) {
      ZipEntry entry;
      while ((entry = zis.getNextEntry()) != null) {
        // 跳过 macOS 生成的 __MACOSX 元数据
        if (entry.getName().startsWith("__MACOSX/")
            || entry.getName().contains("/.DS_Store")
            || entry.getName().endsWith(".DS_Store")) {
          zis.closeEntry();
          continue;
        }

        Path resolved = targetDir.resolve(entry.getName()).normalize();
        if (!resolved.startsWith(targetDir)) {
          throw new IOException("非法的 ZIP 条目（路径穿越）: " + entry.getName());
        }

        if (entry.isDirectory()) {
          Files.createDirectories(resolved);
        } else {
          Files.createDirectories(resolved.getParent());
          try (OutputStream os = Files.newOutputStream(resolved)) {
            zis.transferTo(os);
          }
        }
        zis.closeEntry();
      }
    }
  }

  /** 如果 ZIP 根目录下仅有一个子目录（常见的 skillName/ 包装），则返回该子目录 */
  private Path detectContentRoot(Path extractedDir) throws IOException {
    try (var stream = Files.list(extractedDir)) {
      List<Path> entries = stream.toList();
      if (entries.size() == 1 && Files.isDirectory(entries.get(0))) {
        // 确认顶层目录内包含 SKILL.md 或 scripts/
        Path candidate = entries.get(0);
        if (Files.exists(candidate.resolve("SKILL.md"))
            || Files.exists(candidate.resolve("scripts"))
            || Files.exists(candidate.resolve("package.json"))) {
          return candidate;
        }
      }
    }
    return extractedDir;
  }

  /** 从 SKILL.md 的 frontmatter（name: / platform: 等简易格式）提取字段 */
  private String extractMetadata(Path skillPath, String key, String defaultValue)
      throws IOException {
    Path skillMdPath = skillPath.resolve("SKILL.md");
    if (!Files.exists(skillMdPath)) return defaultValue;
    String prefix = key + ":";
    for (String line : Files.readString(skillMdPath).split("\n")) {
      if (line.startsWith(prefix)) {
        return line.substring(prefix.length()).trim();
      }
    }
    return defaultValue;
  }

  /** 遍历 skill 目录，收集 SKILL.md / package.json / scripts/** / variables.json 作为 FileEntry */
  private List<SkillFile.FileEntry> collectFileEntries(Path skillPath) throws IOException {
    List<SkillFile.FileEntry> entries = new ArrayList<>();

    Path skillMdPath = skillPath.resolve("SKILL.md");
    if (Files.exists(skillMdPath)) {
      entries.add(
          SkillFile.FileEntry.builder()
              .name("SKILL.md")
              .path("SKILL.md")
              .content(Files.readString(skillMdPath))
              .build());
    }
    Path packageJsonPath = skillPath.resolve("package.json");
    if (Files.exists(packageJsonPath)) {
      entries.add(
          SkillFile.FileEntry.builder()
              .name("package.json")
              .path("package.json")
              .content(Files.readString(packageJsonPath))
              .build());
    }
    Path scriptsPath = skillPath.resolve("scripts");
    if (Files.exists(scriptsPath)) {
      try (var stream = Files.list(scriptsPath)) {
        for (Path p : stream.toList()) {
          if (!Files.isRegularFile(p)) continue;
          String name = p.getFileName().toString();
          entries.add(
              SkillFile.FileEntry.builder()
                  .name(name)
                  .path("scripts/" + name)
                  .content(Files.readString(p))
                  .build());
        }
      }
    }
    Path variablesPath = skillPath.resolve("variables.json");
    if (Files.exists(variablesPath)) {
      entries.add(
          SkillFile.FileEntry.builder()
              .name("variables.json")
              .path("variables.json")
              .content(Files.readString(variablesPath))
              .build());
    }
    return entries;
  }

  public void deleteSkill(String skillId) throws IOException {
    // 删除数据库记录
    skillRepository.deleteById(skillId);

    // 删除文件目录
    Path skillPath = Paths.get(skillsDir, skillId);
    if (Files.exists(skillPath)) {
      Files.walk(skillPath)
          .sorted((a, b) -> -a.compareTo(b)) // 反向排序，先删除子文件/目录
          .forEach(
              p -> {
                try {
                  Files.delete(p);
                } catch (IOException e) {
                  log.error("Failed to delete file: {}", p, e);
                }
              });
    }
  }

  private String extractSkillName(Path skillPath) throws IOException {
    Path skillMdPath = skillPath.resolve("SKILL.md");
    if (Files.exists(skillMdPath)) {
      for (String line : Files.readString(skillMdPath).split("\n")) {
        if (line.startsWith("name:")) return line.substring("name:".length()).trim();
      }
    }
    return skillPath.getFileName().toString();
  }

  private String generateDefaultPackageJson(String skillName, String platform) {
    String midscenePkg =
        switch (platform) {
          case "android" -> "@midscene/android";
          case "ios" -> "@midscene/ios";
          case "computer" -> "@midscene/computer";
          default -> "@midscene/web";
        };

    String additionalDeps = platform.equals("browser") ? ",\n    \"puppeteer\": \"^24.0.0\"" : "";

    return """
        {
          "name": "%s",
          "version": "1.0.0",
          "description": "Auto-generated skill by Video Driven Skill",
          "main": "scripts/main.js",
          "scripts": {
            "start": "node scripts/main.js"
          },
          "dependencies": {
            "%s": "^1.5.6",
            "dotenv": "^17.0.0"%s
          }
        }
        """
        .formatted(skillName, midscenePkg, additionalDeps);
  }

  /** 部署 Skill 到本地 ~/.openclaw/skills 目录 智能合并模式：保留旧文件，只更新变化的文件，同名文件会被覆盖 */
  public String deployToLocal(String skillId) throws IOException {
    // 1. 从数据库获取完整的 Skill 文件信息
    SkillFile skillFile = getSkill(skillId);
    if (skillFile == null || skillFile.getFiles() == null || skillFile.getFiles().isEmpty()) {
      throw new FileNotFoundException("Skill not found or has no files: " + skillId);
    }

    String skillName = skillFile.getSkillName();
    // 清理 skillName，确保适合作为目录名
    String safeSkillName = skillName.replaceAll("[^a-zA-Z0-9\\-\\_]", "_");

    Path deployDir =
        Paths.get(System.getProperty("user.home"), ".openclaw", "skills", safeSkillName);

    log.info("Deploying skill '{}' to {}", skillName, deployDir);

    // 2. 确保目标目录存在（不清除已有文件）
    Files.createDirectories(deployDir);
    Files.createDirectories(deployDir.resolve("scripts"));

    // 3. 记录本次部署更新的文件
    List<String> updatedFiles = new ArrayList<>();
    List<String> newFiles = new ArrayList<>();

    // 4. 从数据库写入/更新文件（同名文件会覆盖，其他文件保留）
    for (SkillFile.FileEntry file : skillFile.getFiles()) {
      try {
        Path targetPath = deployDir.resolve(file.getPath());
        // 确保父目录存在
        Files.createDirectories(targetPath.getParent());

        // 检查文件是否已存在
        boolean exists = Files.exists(targetPath);

        // 如果文件已存在且内容相同，跳过
        if (exists) {
          String existingContent = Files.readString(targetPath);
          if (existingContent.equals(file.getContent())) {
            log.debug("File unchanged, skipping: {}", file.getPath());
            continue;
          }
          updatedFiles.add(file.getPath());
        } else {
          newFiles.add(file.getPath());
        }

        // 写入文件内容（覆盖或新建）
        Files.writeString(targetPath, file.getContent());
        log.debug("Deployed file: {}", file.getPath());
      } catch (IOException e) {
        log.error("Failed to write file: {} -> {}", file.getPath(), deployDir, e);
        throw new RuntimeException("Failed to write file: " + file.getPath(), e);
      }
    }

    // 5. 同步知识库目录（knowledge/ 随 skill 自包含部署）
    Path srcKnowledge = Paths.get(skillsDir, skillId, "knowledge");
    if (Files.exists(srcKnowledge)) {
      Path dstKnowledge = deployDir.resolve("knowledge");
      Files.createDirectories(dstKnowledge);
      try (var stream = Files.list(srcKnowledge)) {
        for (Path p : stream.toList()) {
          Path t = dstKnowledge.resolve(p.getFileName().toString());
          Files.copy(p, t, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        }
      }
      log.info("Knowledge base copied to {}", dstKnowledge);
    }

    int totalFiles = skillFile.getFiles().size();
    int updatedCount = updatedFiles.size();
    int newCount = newFiles.size();
    int unchangedCount = totalFiles - updatedCount - newCount;

    log.info(
        "Skill '{}' deployed successfully to {} (total: {}, new: {}, updated: {}, unchanged: {})",
        skillName,
        deployDir,
        totalFiles,
        newCount,
        updatedCount,
        unchangedCount);

    return deployDir.toString();
  }

  // ==================== 重新生成相关方法 ====================

  @Transactional
  public SkillController.RegenerateResponse regenerateSkill(
      String skillId,
      String requirement,
      String additionalPrompt,
      List<GenerateSkillRequest.AnnotatedFrame> frames,
      String mode,
      Consumer<String> logger)
      throws IOException {

    // 1. 获取当前 Skill 记录
    SkillRecord record =
        skillRepository
            .findById(skillId)
            .orElseThrow(() -> new FileNotFoundException("Skill not found: " + skillId));

    // 2. 获取当前代码（main.js）
    String currentCode = extractCurrentMainJs(record);

    // 3. 判断使用哪种模式（默认多模态）
    boolean useMultimodal = !"text".equals(mode); // 默认 multimodal

    Map<String, Object> aiResult;

    if (useMultimodal && frames != null && !frames.isEmpty()) {
      // 多模态模式：携带图片
      logger.accept("🔄 开始重新生成 Skill，第 " + (record.getRegenerationCount() + 1) + " 次迭代");
      logger.accept("📡 使用多模态模式，携带 " + frames.size() + " 张图片");
      if (additionalPrompt != null && !additionalPrompt.isEmpty()) {
        logger.accept(
            "📝 补充要求："
                + additionalPrompt.substring(0, Math.min(additionalPrompt.length(), 100))
                + "...");
      }

      aiResult =
          aiService.generatePartialWithImages(
              requirement,
              additionalPrompt,
              frames,
              currentCode,
              null, // 不指定代码范围，重新生成全部
              null,
              logger);
    } else {
      // 纯文本模式
      List<AIService.SkillContextFrame> contextFrames = toContextFrames(frames);

      logger.accept("🔄 开始重新生成 Skill，第 " + (record.getRegenerationCount() + 1) + " 次迭代");
      logger.accept("📡 使用纯文本模式");
      if (additionalPrompt != null && !additionalPrompt.isEmpty()) {
        logger.accept(
            "📝 补充要求："
                + additionalPrompt.substring(0, Math.min(additionalPrompt.length(), 100))
                + "...");
      }

      aiResult =
          aiService.generateSkillTextOnly(
              requirement, additionalPrompt, contextFrames, currentCode, null, logger);
    }

    // 4. 解析结果
    String skillName = (String) aiResult.get("skillName");
    String platform = (String) aiResult.getOrDefault("platform", "browser");
    String skillMd = (String) aiResult.get("skillMd");
    String packageJson = (String) aiResult.getOrDefault("packageJson", "");
    @SuppressWarnings("unchecked")
    List<Map<String, String>> scripts = (List<Map<String, String>>) aiResult.get("scripts");
    @SuppressWarnings("unchecked")
    List<Map<String, String>> variablesData = (List<Map<String, String>>) aiResult.get("variables");

    // 5. 构建文件列表
    List<SkillFile.FileEntry> candidateFiles = new ArrayList<>();
    candidateFiles.add(
        SkillFile.FileEntry.builder().name("SKILL.md").path("SKILL.md").content(skillMd).build());

    String packageJsonContent =
        packageJson.isEmpty() ? generateDefaultPackageJson(skillName, platform) : packageJson;
    candidateFiles.add(
        SkillFile.FileEntry.builder()
            .name("package.json")
            .path("package.json")
            .content(packageJsonContent)
            .build());

    for (Map<String, String> script : scripts) {
      candidateFiles.add(
          SkillFile.FileEntry.builder()
              .name(script.get("name"))
              .path("scripts/" + script.get("name"))
              .content(script.get("content"))
              .build());
    }

    // 6. 解析变量
    List<SkillFile.SkillVariable> candidateVariables = new ArrayList<>();
    if (variablesData != null) {
      for (Map<String, String> varData : variablesData) {
        if (varData.get("name") != null && !varData.get("name").isEmpty()) {
          candidateVariables.add(
              SkillFile.SkillVariable.builder()
                  .name(varData.get("name"))
                  .label(varData.get("label"))
                  .defaultValue(varData.get("defaultValue"))
                  .type(varData.getOrDefault("type", "string"))
                  .build());
        }
      }
    }
    // 兜底：AI 未返回变量时保留原有变量，避免 accept 后丢失
    if (candidateVariables.isEmpty()) {
      candidateVariables = loadExistingVariables(record);
      if (!candidateVariables.isEmpty()) {
        logger.accept("🔒 AI 未返回变量定义，保留原有 " + candidateVariables.size() + " 个变量");
      }
    }

    // 7. 更新数据库
    int newRegenCount =
        (record.getRegenerationCount() == null ? 0 : record.getRegenerationCount()) + 1;
    record.setRegenerationCount(newRegenCount);
    record.setRequirement(requirement);
    record.setLastAdditionalPrompt(additionalPrompt);

    // 保存候选代码到数据库
    SkillFile candidateSkill =
        SkillFile.builder()
            .skillId(skillId)
            .skillName(skillName)
            .files(candidateFiles)
            .variables(candidateVariables)
            .build();
    record.setCandidateJson(objectMapper.writeValueAsString(candidateSkill));

    skillRepository.save(record);

    // 8. 获取当前生效代码
    SkillFile currentSkill = buildSkillFileFromRecord(record);

    // 9. 获取历史版本（最近3个）
    List<SkillController.SkillVersionInfo> history = getSkillVersionInfoList(skillId);

    logger.accept("✨ 候选代码生成完成：" + skillName);

    SkillController.RegenerateResponse response = new SkillController.RegenerateResponse();
    response.candidate = candidateSkill;
    response.current = currentSkill;
    response.history = history;
    response.iteration = newRegenCount;
    return response;
  }

  /** 局部重新生成 Skill（支持选择图片和代码范围） */
  @Transactional
  public SkillController.RegenerateResponse partialRegenerateSkill(
      String skillId,
      String requirement,
      String additionalPrompt,
      List<GenerateSkillRequest.AnnotatedFrame> selectedFrames,
      SkillController.CodeRange selectedCodeRange,
      String mode,
      Consumer<String> logger)
      throws IOException {

    // 1. 获取当前 Skill 记录
    SkillRecord record =
        skillRepository
            .findById(skillId)
            .orElseThrow(() -> new FileNotFoundException("Skill not found: " + skillId));

    // 2. 确定生成策略
    boolean hasImages = selectedFrames != null && !selectedFrames.isEmpty();
    boolean hasCodeRange =
        selectedCodeRange != null
            && selectedCodeRange.start != null
            && selectedCodeRange.end != null;

    String effectiveMode;
    if ("auto".equals(mode)) {
      if (hasImages) effectiveMode = "multimodal";
      else effectiveMode = "text";
    } else {
      effectiveMode = mode;
    }

    logger.accept("🎯 局部重新生成模式：" + effectiveMode);
    if (hasImages) {
      logger.accept("🖼️ 使用 " + selectedFrames.size() + " 张参考图片");
    }
    if (hasCodeRange) {
      logger.accept("📄 选中代码范围：第 " + selectedCodeRange.start + "-" + selectedCodeRange.end + " 行");
    }

    // 3. 获取当前完整代码
    String currentFullCode = extractCurrentMainJs(record);

    // 4. 调用 AI 生成
    Map<String, Object> aiResult;

    if ("multimodal".equals(effectiveMode) && hasImages) {
      // 多模态模式：携带图片 + 代码范围
      aiResult =
          aiService.generatePartialWithImages(
              requirement,
              additionalPrompt,
              selectedFrames,
              currentFullCode,
              selectedCodeRange,
              null,
              logger);
    } else {
      // 纯文本模式：只发送文本描述
      List<AIService.SkillContextFrame> contextFrames = toContextFrames(selectedFrames);

      aiResult =
          aiService.generatePartialTextOnly(
              requirement,
              additionalPrompt,
              contextFrames,
              currentFullCode,
              selectedCodeRange,
              null,
              logger);
    }

    // 5. 解析 AI 结果
    String skillName = (String) aiResult.get("skillName");
    String platform = (String) aiResult.getOrDefault("platform", record.getPlatform());
    String skillMd = (String) aiResult.get("skillMd");
    String packageJson = (String) aiResult.getOrDefault("packageJson", "");
    @SuppressWarnings("unchecked")
    List<Map<String, String>> scripts = (List<Map<String, String>>) aiResult.get("scripts");
    @SuppressWarnings("unchecked")
    List<Map<String, String>> variablesData = (List<Map<String, String>>) aiResult.get("variables");

    // 6. 构建候选代码文件（不合并，直接保存 AI 生成的代码作为候选）
    List<SkillFile.FileEntry> candidateFiles = new ArrayList<>();
    candidateFiles.add(
        SkillFile.FileEntry.builder().name("SKILL.md").path("SKILL.md").content(skillMd).build());

    String packageJsonContent =
        packageJson.isEmpty() ? generateDefaultPackageJson(skillName, platform) : packageJson;
    candidateFiles.add(
        SkillFile.FileEntry.builder()
            .name("package.json")
            .path("package.json")
            .content(packageJsonContent)
            .build());

    // 处理脚本文件 - 对 main.js 进行合并
    for (Map<String, String> script : scripts) {
      String scriptName = script.get("name");
      String scriptContent = script.get("content");

      logger.accept(
          "📄 处理脚本: "
              + scriptName
              + ", 内容长度: "
              + (scriptContent != null ? scriptContent.length() : 0));

      // 如果是 main.js 且选中了代码范围，强制合并代码（只保留选中行的修改）
      if ("main.js".equals(scriptName) && hasCodeRange) {
        if (scriptContent == null || scriptContent.trim().isEmpty()) {
          logger.accept("⚠️ AI 生成的代码为空，使用原始代码");
          scriptContent = currentFullCode;
        } else {
          logger.accept(
              "🔧 合并代码，选中范围: 第 " + selectedCodeRange.start + "-" + selectedCodeRange.end + " 行");
          scriptContent = mergeCodeChanges(currentFullCode, scriptContent, selectedCodeRange);
        }
      }

      candidateFiles.add(
          SkillFile.FileEntry.builder()
              .name(scriptName)
              .path("scripts/" + scriptName)
              .content(scriptContent)
              .build());
    }

    // 7. 解析变量
    List<SkillFile.SkillVariable> candidateVariables = new ArrayList<>();
    if (variablesData != null) {
      for (Map<String, String> varData : variablesData) {
        if (varData.get("name") != null && !varData.get("name").isEmpty()) {
          candidateVariables.add(
              SkillFile.SkillVariable.builder()
                  .name(varData.get("name"))
                  .label(varData.get("label"))
                  .defaultValue(varData.get("defaultValue"))
                  .type(varData.getOrDefault("type", "string"))
                  .build());
        }
      }
    }
    // 兜底：AI 未返回变量时保留原有变量
    if (candidateVariables.isEmpty()) {
      candidateVariables = loadExistingVariables(record);
      if (!candidateVariables.isEmpty()) {
        logger.accept("🔒 AI 未返回变量定义，保留原有 " + candidateVariables.size() + " 个变量");
      }
    }

    // 8. 更新数据库
    int newRegenCount =
        (record.getRegenerationCount() == null ? 0 : record.getRegenerationCount()) + 1;
    record.setRegenerationCount(newRegenCount);
    record.setRequirement(requirement);
    record.setLastAdditionalPrompt(additionalPrompt);

    SkillFile candidateSkill =
        SkillFile.builder()
            .skillId(skillId)
            .skillName(skillName)
            .files(candidateFiles)
            .variables(candidateVariables)
            .build();
    record.setCandidateJson(objectMapper.writeValueAsString(candidateSkill));

    skillRepository.save(record);

    // 9. 获取当前生效代码
    SkillFile currentSkill = buildSkillFileFromRecord(record);
    List<SkillController.SkillVersionInfo> history = getSkillVersionInfoList(skillId);

    logger.accept("✨ 局部重新生成完成：" + skillName);

    SkillController.RegenerateResponse response = new SkillController.RegenerateResponse();
    response.candidate = candidateSkill;
    response.current = currentSkill;
    response.history = history;
    response.iteration = newRegenCount;
    return response;
  }

  /**
   * 合并代码修改：强制只使用 AI 生成的选中行，其他行保持原样
   *
   * <p>策略： 1. AI 生成的是整个选中区域的替换代码 2. 无论 AI 返回多少行，都将这些行整体替换选中区域 3. 如果 AI 返回空，保持原始代码
   */
  private String mergeCodeChanges(
      String originalCode, String generatedCode, SkillController.CodeRange range) {
    if (range == null || range.start == null || range.end == null) {
      return generatedCode != null && !generatedCode.isEmpty() ? generatedCode : originalCode;
    }

    // 如果生成的代码为空，返回原始代码
    if (generatedCode == null || generatedCode.trim().isEmpty()) {
      return originalCode;
    }

    String[] originalLines = originalCode.split("\n", -1); // -1 保留空行
    String[] generatedLines = generatedCode.split("\n", -1);

    List<String> result = new ArrayList<>();

    // 计算选中范围（0-based）
    int selectedStartIdx = range.start - 1; // 转换为 0-based
    int selectedEndIdx = range.end - 1; // 转换为 0-based（包含）

    // 边界检查
    if (selectedStartIdx < 0) selectedStartIdx = 0;
    if (selectedEndIdx >= originalLines.length) selectedEndIdx = originalLines.length - 1;
    if (selectedStartIdx > selectedEndIdx) selectedStartIdx = selectedEndIdx;

    // 第一部分：选中区域之前的原始代码
    for (int i = 0; i < selectedStartIdx && i < originalLines.length; i++) {
      result.add(originalLines[i]);
    }

    // 第二部分：AI 生成的代码（整体替换选中区域）
    // 清理 AI 生成的代码：去掉可能的 ```javascript 等标记
    List<String> cleanedGeneratedLines = new ArrayList<>();
    for (String line : generatedLines) {
      String trimmed = line.trim();
      // 跳过代码块标记
      if (trimmed.startsWith("```")
          || trimmed.startsWith("```javascript")
          || trimmed.startsWith("```js")
          || trimmed.equals("```")) {
        continue;
      }
      cleanedGeneratedLines.add(line);
    }

    // 如果清理后为空，使用原始代码
    if (cleanedGeneratedLines.isEmpty()) {
      for (int i = selectedStartIdx; i <= selectedEndIdx && i < originalLines.length; i++) {
        result.add(originalLines[i]);
      }
    } else {
      result.addAll(cleanedGeneratedLines);
    }

    // 第三部分：选中区域之后的原始代码
    for (int i = selectedEndIdx + 1; i < originalLines.length; i++) {
      result.add(originalLines[i]);
    }

    return String.join("\n", result);
  }

  @Transactional
  public SkillController.AcceptResponse acceptCandidate(String skillId) throws IOException {
    SkillRecord record =
        skillRepository
            .findById(skillId)
            .orElseThrow(() -> new FileNotFoundException("Skill not found: " + skillId));

    if (record.getCandidateJson() == null || record.getCandidateJson().isEmpty()) {
      throw new IllegalStateException("No candidate to accept");
    }

    // 1. 解析候选代码
    SkillFile candidate = objectMapper.readValue(record.getCandidateJson(), SkillFile.class);

    // 2. 保存当前版本到历史（如果存在）
    if (record.getFilesJson() != null && !record.getFilesJson().isEmpty()) {
      int versionNumber = (record.getCurrentVersion() == null ? 1 : record.getCurrentVersion());

      SkillVersion version =
          SkillVersion.builder()
              .id(UUID.randomUUID().toString())
              .skillId(skillId)
              .versionNumber(versionNumber)
              .skillName(record.getSkillName())
              .platform(record.getPlatform())
              .filesJson(record.getFilesJson())
              .variablesJson(record.getVariablesJson())
              .additionalPrompt(record.getLastAdditionalPrompt())
              .requirement(record.getRequirement())
              .frameCount(0) // 可从其他地方获取
              .acceptedAt(LocalDateTime.now())
              .build();

      skillVersionRepository.save(version);
    }

    // 3. 更新当前版本为候选版本
    int newVersionNumber =
        (record.getCurrentVersion() == null ? 1 : record.getCurrentVersion()) + 1;
    record.setCurrentVersion(newVersionNumber);
    record.setSkillName(candidate.getSkillName());
    record.setFilesJson(objectMapper.writeValueAsString(candidate.getFiles()));
    record.setVariablesJson(objectMapper.writeValueAsString(candidate.getVariables()));
    record.setCandidateJson(null); // 清空候选

    skillRepository.save(record);

    // 4. 同步更新文件系统
    syncSkillFiles(skillId, candidate);

    // 5. 返回结果
    SkillController.AcceptResponse response = new SkillController.AcceptResponse();
    response.current = candidate;
    response.newVersionNumber = newVersionNumber;
    response.history = getSkillVersionInfoList(skillId);

    return response;
  }

  @Transactional
  public void discardCandidate(String skillId) {
    SkillRecord record =
        skillRepository
            .findById(skillId)
            .orElseThrow(() -> new RuntimeException("Skill not found: " + skillId));

    record.setCandidateJson(null);
    skillRepository.save(record);
  }

  public List<SkillController.SkillVersionInfo> getSkillVersions(String skillId) {
    return getSkillVersionInfoList(skillId);
  }

  @Transactional
  public SkillFile restoreVersion(String skillId, Integer versionNumber) throws IOException {
    // 1. 保存当前版本到历史
    SkillRecord record =
        skillRepository
            .findById(skillId)
            .orElseThrow(() -> new FileNotFoundException("Skill not found: " + skillId));

    if (record.getFilesJson() != null && !record.getFilesJson().isEmpty()) {
      int currentVersionNum = (record.getCurrentVersion() == null ? 1 : record.getCurrentVersion());

      SkillVersion currentVersion =
          SkillVersion.builder()
              .id(UUID.randomUUID().toString())
              .skillId(skillId)
              .versionNumber(currentVersionNum)
              .skillName(record.getSkillName())
              .platform(record.getPlatform())
              .filesJson(record.getFilesJson())
              .variablesJson(record.getVariablesJson())
              .requirement(record.getRequirement())
              .acceptedAt(LocalDateTime.now())
              .build();

      skillVersionRepository.save(currentVersion);
    }

    // 2. 获取指定历史版本
    SkillVersion targetVersion =
        skillVersionRepository
            .findBySkillIdAndVersionNumber(skillId, versionNumber)
            .orElseThrow(() -> new FileNotFoundException("Version not found: " + versionNumber));

    // 3. 恢复为当前版本
    int newVersionNumber =
        (record.getCurrentVersion() == null ? 1 : record.getCurrentVersion()) + 1;
    record.setCurrentVersion(newVersionNumber);
    record.setSkillName(targetVersion.getSkillName());
    record.setPlatform(targetVersion.getPlatform());
    record.setFilesJson(targetVersion.getFilesJson());
    record.setVariablesJson(targetVersion.getVariablesJson());

    skillRepository.save(record);

    // 4. 同步文件系统
    List<SkillFile.FileEntry> files =
        objectMapper.readValue(
            targetVersion.getFilesJson(), new TypeReference<List<SkillFile.FileEntry>>() {});
    List<SkillFile.SkillVariable> variables =
        objectMapper.readValue(
            targetVersion.getVariablesJson(),
            new TypeReference<List<SkillFile.SkillVariable>>() {});

    SkillFile skillFile =
        SkillFile.builder()
            .skillId(skillId)
            .skillName(targetVersion.getSkillName())
            .files(files)
            .variables(variables)
            .build();

    syncSkillFiles(skillId, skillFile);

    return skillFile;
  }

  // ==================== 辅助方法 ====================

  /** 从 main.js 中扫描 process.env.XXX / variables.XXX 引用，反推变量定义 */
  private static final Pattern ENV_VAR_PATTERN =
      Pattern.compile("(?:process\\.env|variables\\??)\\.([A-Z][A-Z0-9_]+)");

  List<SkillFile.SkillVariable> extractVariablesFromCode(String mainJsContent) {
    if (mainJsContent == null || mainJsContent.isEmpty()) return new ArrayList<>();
    Set<String> seen = new LinkedHashSet<>();
    Matcher m = ENV_VAR_PATTERN.matcher(mainJsContent);
    while (m.find()) {
      String name = m.group(1);
      // 跳过运行器内部使用的变量
      if (name.equals("DEVICE_ID")
          || name.equals("PATH")
          || name.equals("HOME")
          || name.equals("NODE_ENV")
          || name.startsWith("_")) continue;
      seen.add(name);
    }
    List<SkillFile.SkillVariable> result = new ArrayList<>();
    for (String name : seen) {
      result.add(
          SkillFile.SkillVariable.builder()
              .name(name)
              .label(name)
              .defaultValue("")
              .type("string")
              .build());
    }
    return result;
  }

  /**
   * 从 SKILL.md 的变量表补全变量定义。
   *
   * <p>兼容 AI 生成的常见表格： | {{VAR_NAME}} | 用途说明 | 截图来源 | 示例值 | 必填 |
   *
   * <p>历史 Skill 里经常只在 SKILL.md 写了示例值，variables.json 却为空； 这里在读取 Skill 时补齐，并保留已有变量的用户可见 label/type。
   */
  private List<SkillFile.SkillVariable> enrichVariablesFromSkillMd(
      Path skillPath, List<SkillFile.SkillVariable> existingVariables) throws IOException {
    Path skillMdPath = skillPath.resolve("SKILL.md");
    if (!Files.exists(skillMdPath)) return existingVariables;

    Map<String, SkillFile.SkillVariable> merged = new LinkedHashMap<>();
    if (existingVariables != null) {
      for (SkillFile.SkillVariable variable : existingVariables) {
        if (variable.getName() != null && !variable.getName().isBlank()) {
          merged.put(variable.getName(), variable);
        }
      }
    }

    boolean changed = false;
    for (String line : Files.readString(skillMdPath).split("\n")) {
      String trimmed = line.trim();
      if (!trimmed.startsWith("|") || !trimmed.contains("{{") || !trimmed.contains("}}")) {
        continue;
      }

      String[] cells = trimmed.split("\\|", -1);
      if (cells.length < 5) continue;

      String name = extractVariableName(cells[1]);
      if (name == null || name.isBlank()) continue;

      String label = cleanMarkdownCell(cells.length > 2 ? cells[2] : "");
      String defaultValue = cleanMarkdownCell(cells.length > 4 ? cells[4] : "");
      if (defaultValue.equals("-") || defaultValue.equals("无")) defaultValue = "";

      SkillFile.SkillVariable current = merged.get(name);
      if (current == null) {
        merged.put(
            name,
            SkillFile.SkillVariable.builder()
                .name(name)
                .label(label.isBlank() ? name : label)
                .defaultValue(defaultValue)
                .type(inferVariableType(defaultValue))
                .build());
        changed = true;
      } else {
        if ((current.getLabel() == null
                || current.getLabel().isBlank()
                || current.getLabel().equals(name))
            && !label.isBlank()) {
          current.setLabel(label);
          changed = true;
        }
        if ((current.getDefaultValue() == null || current.getDefaultValue().isBlank())
            && !defaultValue.isBlank()) {
          current.setDefaultValue(defaultValue);
          changed = true;
        }
        if (current.getType() == null || current.getType().isBlank()) {
          current.setType(inferVariableType(current.getDefaultValue()));
          changed = true;
        }
      }
    }

    return changed ? new ArrayList<>(merged.values()) : existingVariables;
  }

  private String extractVariableName(String cell) {
    Matcher matcher = Pattern.compile("\\{\\{\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*}}").matcher(cell);
    return matcher.find() ? matcher.group(1) : null;
  }

  private String cleanMarkdownCell(String cell) {
    if (cell == null) return "";
    return cell.trim()
        .replace("&vert;", "|")
        .replace("\\|", "|")
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n");
  }

  private String inferVariableType(String defaultValue) {
    if (defaultValue == null) return "string";
    String value = defaultValue.trim();
    if (value.equalsIgnoreCase("true") || value.equalsIgnoreCase("false")) return "boolean";
    if (value.matches("-?\\d+(\\.\\d+)?")) return "number";
    return "string";
  }

  private void persistVariables(
      Path skillPath, SkillRecord record, List<SkillFile.SkillVariable> variables) {
    try {
      String variablesJson =
          objectMapper.writeValueAsString(variables != null ? variables : List.of());
      Files.writeString(skillPath.resolve("variables.json"), variablesJson);
      record.setVariablesJson(variablesJson);
      skillRepository.save(record);
    } catch (Exception e) {
      log.warn("Failed to persist enriched variables for skill: {}", record.getSkillId(), e);
    }
  }

  private int nextDisplayOrder() {
    return skillRepository.findAll().stream()
        .map(SkillRecord::getDisplayOrder)
        .filter(Objects::nonNull)
        .max(Integer::compareTo)
        .map(value -> value + 1)
        .orElse(0);
  }

  /** 从已有记录中读取 variables（优先 candidate，再到当前版本） */
  private List<SkillFile.SkillVariable> loadExistingVariables(SkillRecord record) {
    String json = record.getVariablesJson();
    if (json == null || json.isEmpty() || "[]".equals(json.trim())) return new ArrayList<>();
    try {
      return objectMapper.readValue(json, new TypeReference<List<SkillFile.SkillVariable>>() {});
    } catch (Exception e) {
      log.warn("Failed to load existing variables for skill: {}", record.getSkillId());
      return new ArrayList<>();
    }
  }

  private SkillFile buildSkillFileFromRecord(SkillRecord record) throws IOException {
    if (record.getFilesJson() == null || record.getFilesJson().isEmpty()) {
      // 从文件系统读取
      return getSkill(record.getSkillId());
    }

    List<SkillFile.FileEntry> files =
        objectMapper.readValue(
            record.getFilesJson(), new TypeReference<List<SkillFile.FileEntry>>() {});

    List<SkillFile.SkillVariable> variables = new ArrayList<>();
    if (record.getVariablesJson() != null && !record.getVariablesJson().isEmpty()) {
      variables =
          objectMapper.readValue(
              record.getVariablesJson(), new TypeReference<List<SkillFile.SkillVariable>>() {});
    }

    return SkillFile.builder()
        .skillId(record.getSkillId())
        .skillName(record.getSkillName())
        .files(files)
        .variables(variables)
        .build();
  }

  private List<SkillController.SkillVersionInfo> getSkillVersionInfoList(String skillId) {
    List<SkillVersion> versions =
        skillVersionRepository.findBySkillIdOrderByVersionNumberDesc(skillId);

    return versions.stream()
        .limit(3)
        .map(
            v -> {
              SkillController.SkillVersionInfo info = new SkillController.SkillVersionInfo();
              info.versionNumber = v.getVersionNumber();
              info.skillName = v.getSkillName();
              info.acceptedAt = v.getAcceptedAt() != null ? v.getAcceptedAt().toString() : null;
              info.additionalPrompt = v.getAdditionalPrompt();
              return info;
            })
        .collect(Collectors.toList());
  }

  private void syncSkillFiles(String skillId, SkillFile skillFile) throws IOException {
    Path skillPath = Paths.get(skillsDir, skillId);
    Path knowledgeDir = skillPath.resolve("knowledge");

    // 清理旧文件（保留 knowledge/ 目录，它与 skill 自包含但与代码版本独立）
    if (Files.exists(skillPath)) {
      Files.walk(skillPath)
          .sorted((a, b) -> -a.compareTo(b))
          .filter(p -> !p.startsWith(knowledgeDir))
          .filter(p -> !p.equals(skillPath))
          .forEach(
              p -> {
                try {
                  Files.delete(p);
                } catch (IOException e) {
                  log.warn("Failed to delete file: {}", p, e);
                }
              });
    }

    // 创建目录
    Files.createDirectories(skillPath);
    Files.createDirectories(skillPath.resolve("scripts"));

    // 写入新文件
    for (SkillFile.FileEntry file : skillFile.getFiles()) {
      Path filePath = skillPath.resolve(file.getPath());
      Files.createDirectories(filePath.getParent());
      Files.writeString(filePath, file.getContent());
    }

    // 同步 variables.json（candidateFiles 中通常不含此文件，需单独写入）
    if (skillFile.getVariables() != null && !skillFile.getVariables().isEmpty()) {
      Files.writeString(
          skillPath.resolve("variables.json"),
          objectMapper.writeValueAsString(skillFile.getVariables()));
    }
  }

  /** 从 SkillRecord 中提取当前的 main.js 代码 */
  private String extractCurrentMainJs(SkillRecord record) {
    if (record.getFilesJson() == null || record.getFilesJson().isEmpty()) {
      return "";
    }
    try {
      List<SkillFile.FileEntry> files =
          objectMapper.readValue(
              record.getFilesJson(), new TypeReference<List<SkillFile.FileEntry>>() {});

      // 查找 scripts/main.js
      for (SkillFile.FileEntry file : files) {
        if ("scripts/main.js".equals(file.getPath()) || "main.js".equals(file.getName())) {
          return file.getContent();
        }
      }

      // 如果没有找到 main.js，返回所有脚本文件的拼接
      StringBuilder allScripts = new StringBuilder();
      for (SkillFile.FileEntry file : files) {
        if (file.getPath().startsWith("scripts/") && file.getPath().endsWith(".js")) {
          allScripts.append("// === ").append(file.getName()).append(" ===\n");
          allScripts.append(file.getContent()).append("\n\n");
        }
      }
      return allScripts.toString();

    } catch (Exception e) {
      log.warn("Failed to extract current code from record: {}", record.getSkillId(), e);
      return "";
    }
  }

  private List<AIService.SkillContextFrame> toContextFrames(
      List<GenerateSkillRequest.AnnotatedFrame> frames) {
    List<AIService.SkillContextFrame> contextFrames = new ArrayList<>();
    if (frames == null) {
      return contextFrames;
    }
    for (GenerateSkillRequest.AnnotatedFrame frame : frames) {
      contextFrames.add(
          new AIService.SkillContextFrame(
              frame.getTimestamp(), frame.getDescription(), frame.getAnnotationJson()));
    }
    return contextFrames;
  }
}
