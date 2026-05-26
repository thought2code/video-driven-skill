package io.videodrivenskill.controller;

import io.videodrivenskill.model.GenerateSkillRequest;
import io.videodrivenskill.model.SkillFile;
import io.videodrivenskill.model.SkillRecord;
import io.videodrivenskill.service.SkillService;
import java.io.BufferedReader;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Slf4j
@RestController
@RequestMapping("/api/skills")
@RequiredArgsConstructor
public class SkillController {

  private final SkillService skillService;
  private final Map<String, SseEmitter> emitters = new ConcurrentHashMap<>();

  @GetMapping
  public ResponseEntity<List<SkillRecord>> listSkills() {
    return ResponseEntity.ok(skillService.listSkills());
  }

  @PutMapping("/order")
  public ResponseEntity<Void> reorderSkills(@RequestBody Map<String, List<String>> body) {
    try {
      skillService.reorderSkills(body.get("skillIds"));
      return ResponseEntity.ok().build();
    } catch (Exception e) {
      log.error("Failed to reorder skills", e);
      return ResponseEntity.internalServerError().build();
    }
  }

  /** 建立 SSE 日志流，前端先调这个，再调 /generate */
  @GetMapping(value = "/logs/{sessionId}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public SseEmitter streamLogs(@PathVariable String sessionId) {
    SseEmitter emitter = new SseEmitter(180_000L);
    emitters.put(sessionId, emitter);
    emitter.onCompletion(() -> emitters.remove(sessionId));
    emitter.onTimeout(() -> emitters.remove(sessionId));
    emitter.onError(e -> emitters.remove(sessionId));
    return emitter;
  }

  @PostMapping("/generate")
  public ResponseEntity<SkillFile> generateSkill(@RequestBody GenerateSkillRequest request) {
    String sessionId = request.getSessionId();
    SseEmitter emitter = sessionId != null ? emitters.get(sessionId) : null;

    try {
      SkillFile skill =
          skillService.generateSkill(
              request,
              msg -> {
                log.debug("[skill-gen] {}", msg);
                if (emitter != null) {
                  try {
                    emitter.send(SseEmitter.event().data(msg));
                  } catch (Exception e) {
                    // client disconnected, ignore
                  }
                }
              });

      if (emitter != null) {
        try {
          emitter.complete();
        } catch (Exception ignored) {
        }
      }
      return ResponseEntity.ok(skill);
    } catch (Exception e) {
      log.error("Failed to generate skill", e);
      if (emitter != null) {
        try {
          emitter.send(SseEmitter.event().data("❌ 错误：" + e.getMessage()));
          emitter.complete();
        } catch (Exception ignored) {
        }
      }
      return ResponseEntity.internalServerError().build();
    }
  }

  @GetMapping("/{skillId}")
  public ResponseEntity<SkillFile> getSkill(@PathVariable String skillId) {
    try {
      return ResponseEntity.ok(skillService.getSkill(skillId));
    } catch (Exception e) {
      log.error("Failed to get skill: {}", skillId, e);
      return ResponseEntity.notFound().build();
    }
  }

  @PutMapping("/{skillId}/files")
  public ResponseEntity<Void> updateFile(
      @PathVariable String skillId, @RequestBody Map<String, String> body) {
    try {
      skillService.updateFile(skillId, body.get("path"), body.get("content"));
      return ResponseEntity.ok().build();
    } catch (Exception e) {
      log.error("Failed to update skill file: {}", skillId, e);
      return ResponseEntity.internalServerError().build();
    }
  }

  @GetMapping("/{skillId}/export")
  public ResponseEntity<byte[]> exportSkill(@PathVariable String skillId) {
    try {
      byte[] zip = skillService.exportZip(skillId);
      return ResponseEntity.ok()
          .header(HttpHeaders.CONTENT_TYPE, "application/zip")
          .header(
              HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"skill-" + skillId + ".zip\"")
          .body(zip);
    } catch (Exception e) {
      log.error("Failed to export skill: {}", skillId, e);
      return ResponseEntity.internalServerError().build();
    }
  }

  @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<?> importSkill(@RequestParam("file") MultipartFile file) {
    try {
      SkillFile imported = skillService.importSkillFromZip(file);
      return ResponseEntity.ok(imported);
    } catch (IllegalArgumentException e) {
      log.warn("Invalid skill ZIP: {}", e.getMessage());
      return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
    } catch (Exception e) {
      log.error("Failed to import skill", e);
      return ResponseEntity.internalServerError()
          .body(Map.of("message", "导入失败: " + e.getMessage()));
    }
  }

  @DeleteMapping("/{skillId}")
  public ResponseEntity<Void> deleteSkill(@PathVariable String skillId) {
    try {
      skillService.deleteSkill(skillId);
      return ResponseEntity.ok().build();
    } catch (Exception e) {
      log.error("Failed to delete skill: {}", skillId, e);
      return ResponseEntity.internalServerError().build();
    }
  }

  @PostMapping("/{skillId}/deploy")
  public ResponseEntity<Map<String, String>> deploySkill(@PathVariable String skillId) {
    try {
      String deployedPath = skillService.deployToLocal(skillId);
      return ResponseEntity.ok(Map.of("message", "部署成功", "path", deployedPath));
    } catch (Exception e) {
      log.error("Failed to deploy skill: {}", skillId, e);
      return ResponseEntity.internalServerError()
          .body(Map.of("message", "部署失败: " + e.getMessage()));
    }
  }

  // ==================== 重新生成相关接口 ====================

  /** 重新生成 Skill（生成候选版本） */
  @PostMapping("/{skillId}/regenerate")
  public ResponseEntity<RegenerateResponse> regenerateSkill(
      @PathVariable String skillId, @RequestBody RegenerateRequest request) {

    String sessionId = request.sessionId;
    SseEmitter emitter = sessionId != null ? emitters.get(sessionId) : null;

    try {
      RegenerateResponse response =
          skillService.regenerateSkill(
              skillId,
              request.requirement,
              request.additionalPrompt,
              request.frames,
              request.mode,
              msg -> {
                log.debug("[skill-regen] {}", msg);
                if (emitter != null) {
                  try {
                    emitter.send(SseEmitter.event().data(msg));
                  } catch (Exception e) {
                    // client disconnected, ignore
                  }
                }
              });

      if (emitter != null) {
        try {
          emitter.complete();
        } catch (Exception ignored) {
        }
      }
      return ResponseEntity.ok(response);
    } catch (Exception e) {
      log.error("Failed to regenerate skill: {}", skillId, e);
      if (emitter != null) {
        try {
          emitter.send(SseEmitter.event().data("❌ 错误：" + e.getMessage()));
          emitter.complete();
        } catch (Exception ignored) {
        }
      }
      return ResponseEntity.internalServerError().build();
    }
  }

  /** 接受候选代码（提升为当前版本，原版本进历史） */
  @PostMapping("/{skillId}/accept")
  public ResponseEntity<AcceptResponse> acceptCandidate(@PathVariable String skillId) {
    try {
      AcceptResponse response = skillService.acceptCandidate(skillId);
      return ResponseEntity.ok(response);
    } catch (Exception e) {
      log.error("Failed to accept candidate: {}", skillId, e);
      return ResponseEntity.internalServerError().build();
    }
  }

  /** 放弃候选代码（删除候选，保持当前版本不变） */
  @DeleteMapping("/{skillId}/candidate")
  public ResponseEntity<Void> discardCandidate(@PathVariable String skillId) {
    try {
      skillService.discardCandidate(skillId);
      return ResponseEntity.ok().build();
    } catch (Exception e) {
      log.error("Failed to discard candidate: {}", skillId, e);
      return ResponseEntity.internalServerError().build();
    }
  }

  /** 获取 Skill 的历史版本列表 */
  @GetMapping("/{skillId}/versions")
  public ResponseEntity<List<SkillVersionInfo>> getSkillVersions(@PathVariable String skillId) {
    try {
      return ResponseEntity.ok(skillService.getSkillVersions(skillId));
    } catch (Exception e) {
      log.error("Failed to get skill versions: {}", skillId, e);
      return ResponseEntity.internalServerError().build();
    }
  }

  /** 恢复到指定历史版本 */
  @PostMapping("/{skillId}/versions/{versionNumber}/restore")
  public ResponseEntity<SkillFile> restoreVersion(
      @PathVariable String skillId, @PathVariable Integer versionNumber) {
    try {
      return ResponseEntity.ok(skillService.restoreVersion(skillId, versionNumber));
    } catch (Exception e) {
      log.error("Failed to restore version: {}-{}", skillId, versionNumber, e);
      return ResponseEntity.internalServerError().build();
    }
  }

  /** 一键终止所有 Midscene 相关进程 */
  @PostMapping("/kill-all")
  public ResponseEntity<Map<String, Object>> killAllMidsceneProcesses() {
    log.info("Killing all midscene processes...");

    List<String> killedProcesses = new java.util.ArrayList<>();
    List<String> errors = new java.util.ArrayList<>();

    // 1. 终止 node skill 进程
    try {
      Process findNode =
          Runtime.getRuntime()
              .exec(
                  new String[] {
                    "sh",
                    "-c",
                    "ps aux | grep -E 'node.*scripts/main\\.js|node.*skill-run' | grep -v grep | awk '{print $2}'"
                  });
      BufferedReader reader =
          new BufferedReader(new java.io.InputStreamReader(findNode.getInputStream()));
      String line;
      int count = 0;
      while ((line = reader.readLine()) != null) {
        String pid = line.trim();
        if (!pid.isEmpty()) {
          try {
            Runtime.getRuntime().exec("kill -9 " + pid).waitFor();
            count++;
          } catch (Exception e) {
            errors.add("Failed to kill node pid " + pid + ": " + e.getMessage());
          }
        }
      }
      if (count > 0) {
        killedProcesses.add("skill-scripts (" + count + " processes)");
      }
    } catch (Exception e) {
      errors.add("Error finding node processes: " + e.getMessage());
    }

    // 2. 终止 adb screencap/shell 进程
    try {
      Process findAdb =
          Runtime.getRuntime()
              .exec(
                  new String[] {
                    "sh",
                    "-c",
                    "ps aux | grep -E 'adb.*screencap|adb.*shell' | grep -v grep | awk '{print $2}'"
                  });
      BufferedReader reader =
          new BufferedReader(new java.io.InputStreamReader(findAdb.getInputStream()));
      String line;
      int count = 0;
      while ((line = reader.readLine()) != null) {
        String pid = line.trim();
        if (!pid.isEmpty()) {
          try {
            Runtime.getRuntime().exec("kill -9 " + pid).waitFor();
            count++;
          } catch (Exception e) {
            errors.add("Failed to kill adb pid " + pid + ": " + e.getMessage());
          }
        }
      }
      if (count > 0) {
        killedProcesses.add("adb-processes (" + count + " processes)");
      }
    } catch (Exception e) {
      errors.add("Error finding adb processes: " + e.getMessage());
    }

    // 3. 清理临时目录
    int cleanedDirs = 0;
    try {
      java.nio.file.Path tempDir = java.nio.file.Paths.get(System.getProperty("java.io.tmpdir"));
      java.util.List<java.nio.file.Path> skillRunDirs =
          java.nio.file.Files.list(tempDir)
              .filter(p -> p.getFileName().toString().startsWith("skill-run-"))
              .toList();
      for (java.nio.file.Path dir : skillRunDirs) {
        try {
          java.nio.file.Files.walk(dir)
              .sorted(java.util.Comparator.reverseOrder())
              .forEach(
                  p -> {
                    try {
                      java.nio.file.Files.delete(p);
                    } catch (Exception ignored) {
                    }
                  });
          cleanedDirs++;
        } catch (Exception e) {
          errors.add("Failed to cleanup dir " + dir + ": " + e.getMessage());
        }
      }
    } catch (Exception e) {
      errors.add("Error cleaning temp dirs: " + e.getMessage());
    }

    Map<String, Object> result = new java.util.HashMap<>();
    result.put("success", true);
    result.put("killed", killedProcesses);
    result.put("cleanedDirs", cleanedDirs);
    if (!errors.isEmpty()) {
      result.put("errors", errors);
    }

    log.info("Killed processes: {}, cleaned dirs: {}", killedProcesses, cleanedDirs);
    return ResponseEntity.ok(result);
  }

  /** 局部重新生成 Skill（支持选择图片和代码范围） */
  @PostMapping("/{skillId}/partial-regenerate")
  public ResponseEntity<RegenerateResponse> partialRegenerateSkill(
      @PathVariable String skillId, @RequestBody PartialRegenerateRequest request) {

    String sessionId = request.sessionId;
    SseEmitter emitter = sessionId != null ? emitters.get(sessionId) : null;

    try {
      RegenerateResponse response =
          skillService.partialRegenerateSkill(
              skillId,
              request.requirement,
              request.additionalPrompt,
              request.selectedFrames,
              request.selectedCodeRange,
              request.mode,
              msg -> {
                log.debug("[skill-partial] {}", msg);
                if (emitter != null) {
                  try {
                    emitter.send(SseEmitter.event().data(msg));
                  } catch (Exception e) {
                    // client disconnected, ignore
                  }
                }
              });

      if (emitter != null) {
        try {
          emitter.complete();
        } catch (Exception ignored) {
        }
      }
      return ResponseEntity.ok(response);
    } catch (Exception e) {
      log.error("Failed to partial regenerate skill: {}", skillId, e);
      if (emitter != null) {
        try {
          emitter.send(SseEmitter.event().data("❌ 错误：" + e.getMessage()));
          emitter.complete();
        } catch (Exception ignored) {
        }
      }
      return ResponseEntity.internalServerError().build();
    }
  }

  // ==================== Request/Response DTOs ====================

  public static class RegenerateRequest {
    public String sessionId;
    public String requirement;
    public String additionalPrompt;
    public List<GenerateSkillRequest.AnnotatedFrame> frames;
    public String mode; // text | multimodal，默认 multimodal
  }

  public static class PartialRegenerateRequest {
    public String sessionId;
    public String requirement;
    public String additionalPrompt;
    public List<GenerateSkillRequest.AnnotatedFrame> selectedFrames; // 完整的帧数据
    public CodeRange selectedCodeRange; // 选中的代码范围（可选）
    public String mode; // auto | text | multimodal
  }

  public static class CodeRange {
    public Integer start;
    public Integer end;
  }

  public static class RegenerateResponse {
    public SkillFile candidate; // 候选代码
    public SkillFile current; // 当前生效代码
    public List<SkillVersionInfo> history; // 历史版本（最近3个）
    public Integer iteration; // 当前迭代次数
  }

  public static class AcceptResponse {
    public SkillFile current; // 新的当前代码
    public Integer newVersionNumber; // 新版本号
    public List<SkillVersionInfo> history; // 更新后的历史
  }

  public static class SkillVersionInfo {
    public Integer versionNumber;
    public String skillName;
    public String acceptedAt;
    public String additionalPrompt;
  }
}
