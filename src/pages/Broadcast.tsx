import { Layout } from "@/components/Layout";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/context/AuthContext";
import { sanitizeAvatarUrl } from "@/lib/sanitize";
import { useApi } from "@/lib/api";

const MESSAGE_MAX_LENGTH = 4096;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{5,32}$/;

interface AudienceResult {
  id: string;
  name: string;
  count: number;
  timestamp: string;
}

interface FailureDetail {
  username: string;
  error: string;
}

interface IgnoredPreview {
  value?: string | null;
  source?: string | null;
  reason?: string | null;
}

interface BroadcastSummary {
  sent: number;
  failed: number;
  total: number;
  duplicates: number;
  ignored: number;
  throttleMs: number;
  failures: FailureDetail[];
  ignoredPreview: IgnoredPreview[];
  audienceMeta: {
    id: string;
    sessionId?: string | null;
    timestamp?: string | null;
    count?: number | null;
  } | null;
}

interface ManualParsed {
  valid: string[];
  invalid: string[];
}

function parseManualUsernames(input: string): ManualParsed {
  if (!input.trim()) {
    return { valid: [], invalid: [] };
  }

  const entries = input
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const valid: string[] = [];
  const invalid: string[] = [];

  entries.forEach((entry) => {
    const sanitized = entry.replace(/^@+/, "");
    if (USERNAME_REGEX.test(sanitized)) {
      valid.push(sanitized);
    } else {
      invalid.push(entry);
    }
  });

  return { valid, invalid };
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseFailuresList(value: unknown): FailureDetail[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return null;
      }
      const record = item as Record<string, unknown>;
      const username = getString(record.username) || getString(record.user) || "";
      const error = getString(record.error) || "";
      if (!username && !error) {
        return null;
      }
      return {
        username: username || "—",
        error: error || "Неизвестная ошибка",
      };
    })
    .filter((item): item is FailureDetail => item !== null);
}

function parseIgnoredList(value: unknown): IgnoredPreview[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return null;
      }
      const record = item as Record<string, unknown>;
      return {
        value: getString(record.value) || getString(record.username) || null,
        source: getString(record.source) || null,
        reason: getString(record.reason) || null,
      };
    })
    .filter((item): item is IgnoredPreview => item !== null);
}

function formatSourceLabel(source?: string | null): string | undefined {
  if (!source) return undefined;
  if (source === "manual") return "ручной ввод";
  if (source === "audience") return "из базы";
  return source;
}

function formatReasonLabel(reason?: string | null): string | undefined {
  if (!reason) return undefined;
  switch (reason) {
    case "invalid_format":
      return "некорректный формат";
    case "empty":
      return "пустое значение";
    case "invalid_type":
      return "некорректный тип";
    default:
      return reason;
  }
}

export default function Broadcast() {
  const { toast } = useToast();
  const { user } = useAuth();
  const api = useApi();

  const backgroundImage = sanitizeAvatarUrl(user?.photo_url ?? null) || undefined;

  const [audienceResults, setAudienceResults] = useState<AudienceResult[]>([]);
  const [selectedAudienceId, setSelectedAudienceId] = useState<string>("__none");
  const [selectedAudience, setSelectedAudience] = useState<AudienceResult | null>(null);

  const [message, setMessage] = useState("");
  const [manualNicknames, setManualNicknames] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");

  const [sentCount, setSentCountState] = useState(0);
  const [failedCount, setFailedCountState] = useState(0);
  const [totalCount, setTotalCountState] = useState(0);

  const [summary, setSummary] = useState<BroadcastSummary | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const sentRef = useRef(0);
  const failedRef = useRef(0);
  const totalRef = useRef(0);

  const updateSentCount = (value: number) => {
    setSentCountState(value);
    sentRef.current = value;
  };

  const updateFailedCount = (value: number) => {
    setFailedCountState(value);
    failedRef.current = value;
  };

  const updateTotalCount = (value: number) => {
    setTotalCountState(value);
    totalRef.current = value;
  };

  const manualParsed = useMemo(() => parseManualUsernames(manualNicknames), [manualNicknames]);

  const estimatedRecipients = (selectedAudience?.count || 0) + manualParsed.valid.length;

  useEffect(() => {
    if (!user?.id) {
      setAudienceResults([]);
      setSelectedAudienceId("__none");
      setSelectedAudience(null);
      return;
    }

    const loadAudienceResults = async () => {
      try {
        const response = await api.get("/telegram/audience-results") as { results: AudienceResult[] };
        setAudienceResults(response.results || []);
      } catch (error) {
        console.error("Failed to load audience results", error);
        toast({
          title: "Ошибка загрузки",
          description: "Не удалось получить сохранённые базы аудитории",
          variant: "destructive",
        });
      }
    };

    loadAudienceResults();
  }, [api, toast, user?.id]);

  useEffect(() => {
    if (!selectedAudienceId || selectedAudienceId === "__none") {
      setSelectedAudience(null);
      return;
    }
    const found = audienceResults.find((item) => item.id === selectedAudienceId);
    if (found) {
      setSelectedAudience(found);
    } else {
      setSelectedAudienceId("__none");
      setSelectedAudience(null);
    }
  }, [audienceResults, selectedAudienceId]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const handleBroadcast = async () => {
    if (!user?.id) {
      toast({
        title: "Ошибка",
        description: "Необходима авторизация",
        variant: "destructive",
      });
      return;
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      toast({
        title: "Ошибка",
        description: "Введите текст сообщения",
        variant: "destructive",
      });
      return;
    }

    if (trimmedMessage.length > MESSAGE_MAX_LENGTH) {
      toast({
        title: "Ошибка",
        description: "Сообщение превышает допустимую длину (4096 символов)",
        variant: "destructive",
      });
      return;
    }

    const hasAudience = Boolean(selectedAudienceId) && selectedAudienceId !== "__none";

    if (hasAudience && (!selectedAudience || selectedAudience.count <= 0) && manualParsed.valid.length === 0) {
      toast({
        title: "Ошибка",
        description: "Выбранная база аудитории не содержит пользователей",
        variant: "destructive",
      });
      return;
    }

    if (!hasAudience && manualParsed.valid.length === 0) {
      toast({
        title: "Ошибка",
        description: "Добавьте хотя бы одного получателя",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setProgress(0);
    setStatusMessage("Подготовка рассылки...");
    updateSentCount(0);
    updateFailedCount(0);
    setSummary(null);
    updateTotalCount(estimatedRecipients > 0 ? estimatedRecipients : 0);

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const payload: Record<string, unknown> = {
      message: trimmedMessage,
    };

    if (hasAudience) {
      payload.audienceId = selectedAudienceId;
    }

    if (manualParsed.valid.length > 0) {
      payload.usernames = manualParsed.valid;
    }

    try {
      const response = await api.post("/telegram/broadcast", payload) as {
        taskId: string;
        total?: number;
        throttleMs?: number;
        ignored?: number;
        duplicates?: number;
        audienceId?: string | null;
      };

      const totalFromResponse = getNumber(response.total);
      if (typeof totalFromResponse === "number" && totalFromResponse > 0) {
        updateTotalCount(totalFromResponse);
      } else if (estimatedRecipients > 0) {
        updateTotalCount(estimatedRecipients);
      } else {
        updateTotalCount(0);
      }

      if ((response.ignored ?? 0) > 0 || (response.duplicates ?? 0) > 0) {
        const parts = [] as string[];
        if ((response.ignored ?? 0) > 0) {
          parts.push(`игнорировано: ${response.ignored}`);
        }
        if ((response.duplicates ?? 0) > 0) {
          parts.push(`дубликатов: ${response.duplicates}`);
        }
        toast({
          title: "Часть получателей будет пропущена",
          description: parts.join(" • "),
        });
      }

      const API_BASE_URL = import.meta.env.PROD ? "/api" : (import.meta.env.VITE_API_URL || "/api");
      const sseUrl = `${API_BASE_URL}/tasks/${response.taskId}/stream?userId=${encodeURIComponent(user.id)}`;

      console.log("[PROGRESS] Opening broadcast SSE connection:", sseUrl);

      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log("[PROGRESS] Broadcast SSE connection opened");
      };

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data) as Record<string, unknown>;
        console.log("[PROGRESS] Broadcast SSE message:", data);

        const messageText = getString(data.message);
        if (messageText) {
          setStatusMessage(messageText);
        }

        const totalFromEvent = getNumber(data.limit ?? data.total);
        if (typeof totalFromEvent === "number" && totalFromEvent > 0) {
          updateTotalCount(totalFromEvent);
        }

        if (data.status === "running") {
          const sentValue = getNumber(data.sent);
          if (typeof sentValue === "number" && sentValue >= 0) {
            updateSentCount(sentValue);
          }

          const failedValue = getNumber(data.failed);
          if (typeof failedValue === "number" && failedValue >= 0) {
            updateFailedCount(failedValue);
          }

          const progressValue = getNumber(data.progress);
          if (typeof progressValue === "number") {
            setProgress(Math.min(100, Math.max(0, Math.round(progressValue))));
          } else {
            const current = getNumber(data.current);
            const total = getNumber(data.limit ?? data.total);
            if (typeof current === "number" && typeof total === "number" && total > 0) {
              const computed = Math.round((current / total) * 100);
              setProgress(Math.min(100, Math.max(0, computed)));
            }
          }
        }

        if (data.status === "completed") {
          console.log("[PROGRESS] Broadcast task completed");
          eventSource.close();
          eventSourceRef.current = null;

          setIsLoading(false);
          setProgress(100);
          setStatusMessage("Рассылка завершена");

          const result = (data.result || {}) as Record<string, unknown>;

          const ignoredData = result.ignored;
          const ignoredCount = typeof ignoredData === "number"
            ? ignoredData
            : ignoredData && typeof ignoredData === "object"
              ? getNumber((ignoredData as Record<string, unknown>).count) ?? 0
              : getNumber((data as Record<string, unknown>).ignored) ?? 0;

          const summaryData: BroadcastSummary = {
            sent: getNumber(result.sent) ?? sentRef.current,
            failed: getNumber(result.failed) ?? failedRef.current,
            total: getNumber(result.total) ?? totalRef.current,
            duplicates: getNumber(result.duplicates) ?? getNumber((data as Record<string, unknown>).duplicates) ?? 0,
            ignored: ignoredCount,
            throttleMs: getNumber(result.throttleMs) ?? getNumber((data as Record<string, unknown>).throttleMs) ?? 0,
            failures: parseFailuresList(result.failures),
            ignoredPreview: ignoredData && typeof ignoredData === "object"
              ? parseIgnoredList((ignoredData as Record<string, unknown>).preview)
              : [],
            audienceMeta: (() => {
              const meta = result.audienceMeta;
              if (meta && typeof meta === "object") {
                const record = meta as Record<string, unknown>;
                const id = getString(record.id);
                if (!id) return null;
                return {
                  id,
                  sessionId: getString(record.sessionId),
                  timestamp: getString(record.timestamp),
                  count: getNumber(record.count),
                };
              }
              return null;
            })(),
          };

          updateSentCount(summaryData.sent);
          updateFailedCount(summaryData.failed);
          updateTotalCount(summaryData.total);
          setSummary(summaryData);

          toast({
            title: "Рассылка завершена",
            description: `Отправлено ${summaryData.sent} из ${summaryData.total}${summaryData.failed > 0 ? `, ошибок: ${summaryData.failed}` : ""}`,
          });
        } else if (data.status === "failed") {
          console.log("[PROGRESS] Broadcast task failed:", data.error);
          eventSource.close();
          eventSourceRef.current = null;

          setIsLoading(false);
          setSummary(null);

          const errorMessage = getString(data.error) || "Не удалось выполнить рассылку";
          setStatusMessage(errorMessage);

          toast({
            title: "Ошибка рассылки",
            description: errorMessage,
            variant: "destructive",
          });
        }
      };

      eventSource.onerror = () => {
        console.log("[PROGRESS] Broadcast SSE connection error");
        eventSource.close();
        eventSourceRef.current = null;

        setIsLoading(false);
        setStatusMessage("Не удалось получить статус задачи");

        toast({
          title: "Ошибка соединения",
          description: "Не удалось получить статус рассылки от сервера",
          variant: "destructive",
        });
      };
    } catch (error) {
      console.error("Broadcast request failed", error);
      setIsLoading(false);
      setSummary(null);

      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось запустить рассылку",
        variant: "destructive",
      });
    }
  };

  return (
    <Layout backgroundImage={backgroundImage}>
      <div className="space-y-6 max-w-2xl mx-auto animate-slide-up">
        <GlassCard>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-2xl bg-primary/20 glow-effect">
              <Send className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Рассылка</h1>
              <p className="text-sm text-muted-foreground">Отправьте сообщения аудитории</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Выберите базу контактов</Label>
              <Select
                value={selectedAudienceId}
                onValueChange={(value) => {
                  setSelectedAudienceId(value);
                  if (value === "__none") {
                    setSelectedAudience(null);
                  }
                }}
              >
                <SelectTrigger className="glass-card border-white/20 mt-1">
                  <SelectValue placeholder="Выберите аудиторию" />
                </SelectTrigger>
                <SelectContent className="glass-card glass-effect">
                  {audienceResults.length > 0 ? (
                    <>
                      <SelectItem value="__none">Без базы</SelectItem>
                      {audienceResults.map((result) => (
                        <SelectItem key={result.id} value={result.id}>
                          {result.name} • {result.count}
                        </SelectItem>
                      ))}
                    </>
                  ) : (
                    <SelectItem value="empty" disabled>
                      {user?.id ? "Нет сохранённых результатов" : "Необходима авторизация"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {selectedAudience && (
                <p className="text-xs text-muted-foreground mt-1">
                  В базе {selectedAudience.count} получател{selectedAudience.count === 1 ? "ь" : selectedAudience.count >= 2 && selectedAudience.count <= 4 ? "я" : "ей"} • {new Date(selectedAudience.timestamp).toLocaleString("ru-RU")}
                </p>
              )}
            </div>

            <div>
              <Label>Ручной ввод никнеймов</Label>
              <Textarea
                placeholder="@username1, @username2, @username3"
                className="glass-card border-white/20 mt-1 min-h-[90px] resize-none"
                value={manualNicknames}
                onChange={(event) => setManualNicknames(event.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Введите никнеймы через запятую, пробел или перенос строки. Некорректные значения будут пропущены автоматически.
              </p>
              {(manualParsed.valid.length > 0 || manualParsed.invalid.length > 0) && (
                <p className="text-xs text-muted-foreground">
                  Готово к отправке: {manualParsed.valid.length}
                  {manualParsed.invalid.length > 0 && (
                    <span className="text-destructive"> • Игнорируется: {manualParsed.invalid.length}</span>
                  )}
                </p>
              )}
            </div>

            <div>
              <Label>Текст сообщения</Label>
              <Textarea
                placeholder="Напишите ваше сообщение..."
                className="glass-card border-white/20 mt-1 min-h-[150px] resize-none"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={MESSAGE_MAX_LENGTH}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {message.length} / {MESSAGE_MAX_LENGTH} символов
              </p>
            </div>

            <GlassCard className="bg-accent/5 border-accent/20">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-accent" />
                Безопасность рассылки
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0" />
                  <span className="text-muted-foreground">Автоматические паузы между сообщениями</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0" />
                  <span className="text-muted-foreground">Соблюдение лимитов Telegram API</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0" />
                  <span className="text-muted-foreground">Защита от блокировки аккаунта</span>
                </div>
              </div>
            </GlassCard>

            {(isLoading || progress > 0 || statusMessage) && (
              <div className="space-y-2">
                {statusMessage && (
                  <p className="text-xs text-muted-foreground">{statusMessage}</p>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Прогресс</span>
                  <span className="font-medium">{Math.min(100, Math.max(0, Math.round(progress)))}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Оценочное количество получателей: {estimatedRecipients}
            </div>

            <Button
              onClick={handleBroadcast}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 glow-effect mt-4"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Отправка...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Начать рассылку
                </>
              )}
            </Button>
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <GlassCard className="text-center p-4">
            <p className="text-2xl font-bold">{totalCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Получателей</p>
          </GlassCard>

          <GlassCard className="text-center p-4">
            <p className="text-2xl font-bold text-accent">{sentCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Отправлено</p>
          </GlassCard>

          <GlassCard className="text-center p-4">
            <p className="text-2xl font-bold text-destructive">{failedCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Ошибки</p>
          </GlassCard>
        </div>

        {summary && (
          <GlassCard className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Итоги рассылки</h3>
              {summary.audienceMeta && (
                <p className="text-xs text-muted-foreground mt-1">
                  База: {summary.audienceMeta.count ?? "—"} получател{summary.audienceMeta?.count === 1 ? "ь" : summary.audienceMeta?.count && summary.audienceMeta.count >= 2 && summary.audienceMeta.count <= 4 ? "я" : "ей"}
                  {summary.audienceMeta.timestamp ? ` • ${new Date(summary.audienceMeta.timestamp).toLocaleString("ru-RU")}` : ""}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Дубликаты</p>
                <p className="text-base font-semibold mt-1">{summary.duplicates}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Пропущено</p>
                <p className="text-base font-semibold mt-1">{summary.ignored}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Пауза между сообщениями</p>
                <p className="text-base font-semibold mt-1">{summary.throttleMs > 0 ? `${(summary.throttleMs / 1000).toFixed(1)} с` : "—"}</p>
              </div>
            </div>

            {summary.failures.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Ошибки отправки</p>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {summary.failures.map(({ username, error }, index) => (
                    <div
                      key={`${username}-${index}`}
                      className="flex flex-col rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm"
                    >
                      <span className="font-semibold text-destructive">{username}</span>
                      <span className="text-xs text-muted-foreground">{error}</span>
                    </div>
                  ))}
                </div>
                {summary.failures.length >= 50 && (
                  <p className="text-xs text-muted-foreground">Показаны первые 50 ошибок.</p>
                )}
              </div>
            )}

            {summary.ignoredPreview.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Пропущенные никнеймы</p>
                <div className="space-y-2">
                  {summary.ignoredPreview.map((item, index) => (
                    <div
                      key={`${item.value ?? "unknown"}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs"
                    >
                      <div className="flex flex-col">
                        <span className="font-semibold">{item.value || "—"}</span>
                        <span className="text-muted-foreground">
                          {[formatSourceLabel(item.source), formatReasonLabel(item.reason)]
                            .filter(Boolean)
                            .join(" • ")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>
        )}
      </div>
    </Layout>
  );
}
