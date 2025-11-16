import { Layout } from "@/components/Layout";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Send, Loader2, CheckCircle2, AlertCircle, Upload, X, AlertTriangle } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/context/AuthContext";
import { sanitizeAvatarUrl } from "@/lib/sanitize";
import { useApi } from "@/lib/api";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BroadcastHistory } from "@/components/BroadcastHistory";

interface AudienceResult {
  id: string;
  name: string;
  count: number;
}

interface BroadcastDraft {
  mode: "dm" | "chat";
  audienceId: string;
  message: string;
  manualRecipients: string;
  maxRecipients: string;
  delaySeconds: number;
  imageBase64: string;
}

const STORAGE_KEY = "broadcastDraft_v1";
const DEFAULT_DELAY = 3;
const MIN_DELAY = 1;
const DELAY_WARNING_THRESHOLD = 2;

export default function Broadcast() {
  const { toast } = useToast();
  const { user } = useAuth();
  const api = useApi();
  const backgroundImage = sanitizeAvatarUrl(user?.photo_url ?? null) || undefined;
  const eventSourceRef = useRef<EventSource | null>(null);

  // Form state
  const [mode, setMode] = useState<"dm" | "chat">("dm");
  const [audienceId, setAudienceId] = useState("");
  const [message, setMessage] = useState("");
  const [manualRecipients, setManualRecipients] = useState("");
  const [maxRecipients, setMaxRecipients] = useState("");
  const [delaySeconds, setDelaySeconds] = useState([DEFAULT_DELAY]);
  const [imageBase64, setImageBase64] = useState("");
  const [imageThumbnail, setImageThumbnail] = useState("");

  // Progress state
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [sentCount, setSentCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [failureCount, setFailureCount] = useState(0);

  // UI state
  const [audienceResults, setAudienceResults] = useState<AudienceResult[]>([]);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  // Load audience results
  useEffect(() => {
    const loadAudiences = async () => {
      try {
        const response = await api.get("/telegram/audience-results") as {
          results: AudienceResult[];
        };
        setAudienceResults(response.results || []);
      } catch (e) {
        console.error("Failed to load audience results", e);
        setAudienceResults([]);
      }
    };

    if (user?.id) {
      loadAudiences();
    }
  }, [user?.id, api]);

  // Load draft from localStorage on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(STORAGE_KEY);
    if (savedDraft) {
      try {
        const draft: BroadcastDraft = JSON.parse(savedDraft);
        setMode(draft.mode || "dm");
        setAudienceId(draft.audienceId || "");
        setMessage(draft.message || "");
        setManualRecipients(draft.manualRecipients || "");
        setMaxRecipients(draft.maxRecipients || "");
        setDelaySeconds([draft.delaySeconds || DEFAULT_DELAY]);
        if (draft.imageBase64) {
          setImageBase64(draft.imageBase64);
          setImageThumbnail(draft.imageBase64);
        }
      } catch (e) {
        console.error("Failed to load draft", e);
      }
    }
  }, []);

  // Save draft to localStorage whenever it changes
  useEffect(() => {
    if (!isLoading) {
      const draft: BroadcastDraft = {
        mode,
        audienceId,
        message,
        manualRecipients,
        maxRecipients,
        delaySeconds: delaySeconds[0],
        imageBase64,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    }
  }, [mode, audienceId, message, manualRecipients, maxRecipients, delaySeconds, imageBase64, isLoading]);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/png", "image/jpeg"];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Ошибка",
        description: "Допускаются только PNG и JPG",
        variant: "destructive",
      });
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast({
        title: "Ошибка",
        description: "Размер файла не должен превышать 5MB",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setImageBase64(base64);
      setImageThumbnail(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImageBase64("");
    setImageThumbnail("");
  };

  const parseManualRecipients = (): string[] => {
    return manualRecipients
      .split(/[,\n]/)
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
  };

  const validateForm = (): boolean => {
    if (!message.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите текст сообщения",
        variant: "destructive",
      });
      return false;
    }

    const hasAudience = !!audienceId;
    const manualList = parseManualRecipients();
    const hasManualRecipients = manualList.length > 0;

    if (!hasAudience && !hasManualRecipients) {
      toast({
        title: "Ошибка",
        description: "Выберите аудиторию или введите получателей",
        variant: "destructive",
      });
      return false;
    }

    if (delaySeconds[0] < MIN_DELAY) {
      toast({
        title: "Ошибка",
        description: `Минимальная задержка: ${MIN_DELAY} секунда`,
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleBroadcast = async () => {
    if (!validateForm()) return;
    if (!user?.id) {
      toast({
        title: "Ошибка",
        description: "Необходима авторизация",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setProgress(0);
    setSentCount(0);
    setTotalCount(0);
    setSuccessCount(0);
    setFailureCount(0);
    setProgressStatus("Инициализация...");

    try {
      const payload = {
        mode,
        audienceId: audienceId || undefined,
        manualRecipients: parseManualRecipients(),
        message,
        imageBase64: imageBase64 || undefined,
        maxRecipients: maxRecipients ? Number(maxRecipients) : undefined,
        delaySeconds: delaySeconds[0],
        userId: user.id,
      };

      const response = await api.post("/telegram/broadcast", payload) as {
        taskId: string;
        historyId: string;
      };

      // Open SSE stream
      const API_BASE_URL =
        import.meta.env.PROD
          ? "/api"
          : import.meta.env.VITE_API_URL || "/api";
      const sseUrl = `${API_BASE_URL}/tasks/${response.taskId}/stream?userId=${encodeURIComponent(user.id)}`;

      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log("[BROADCAST] SSE connection opened");
      };

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("[BROADCAST] Progress:", data);

        if (data.status === "completed") {
          eventSource.close();
          eventSourceRef.current = null;
          setIsLoading(false);

          const success = Number(data.result?.successCount) || 0;
          const failure = Number(data.result?.failureCount) || 0;
          const total = success + failure;

          setSuccessCount(success);
          setFailureCount(failure);
          setTotalCount(total);
          setProgress(100);

          // Clear localStorage on successful completion
          localStorage.removeItem(STORAGE_KEY);

          // Trigger history refresh
          setHistoryRefreshTrigger(prev => prev + 1);

          toast({
            title: "Рассылка завершена",
            description: `Успешно: ${success}, Ошибок: ${failure}`,
          });
        } else if (data.status === "failed") {
          eventSource.close();
          eventSourceRef.current = null;
          setIsLoading(false);
          setProgressStatus("Ошибка");

          toast({
            title: "Ошибка рассылки",
            description: data.error || "Не удалось отправить рассылку",
            variant: "destructive",
          });
        } else if (data.status === "running") {
          const current = Number(data.current) || 0;
          const total = Number(data.total) || 0;
          const progressPercent = total > 0 ? Math.round((current / total) * 100) : 0;

          setSentCount(current);
          setTotalCount(total);
          setProgress(progressPercent);
          setProgressStatus(data.message || "Отправка...");

          const success = Number(data.successCount) || 0;
          const failure = Number(data.failureCount) || 0;
          setSuccessCount(success);
          setFailureCount(failure);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        setIsLoading(false);
        setProgressStatus("Ошибка соединения");

        toast({
          title: "Ошибка",
          description: "Не удалось подключиться к серверу",
          variant: "destructive",
        });
      };
    } catch (e) {
      setIsLoading(false);
      const errorMessage =
        e instanceof Error ? e.message : "Неизвестная ошибка";
      toast({
        title: "Ошибка отправки",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  return (
    <Layout backgroundImage={backgroundImage}>
      <div className="space-y-6 max-w-6xl mx-auto animate-slide-up">
        <GlassCard>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-2xl bg-primary/20 glow-effect">
              <Send className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Рассылка</h1>
              <p className="text-sm text-muted-foreground">
                Отправьте сообщения аудитории
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Mode Selection */}
            <div className="flex items-center gap-4 p-3 rounded-lg bg-secondary/30">
              <div className="flex-1">
                <Label className="text-sm">Режим отправки</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {mode === "dm"
                    ? "Личные сообщения (более надежно)"
                    : "Сообщения в чаты"}
                </p>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-xs">ЛС</span>
                <Switch
                  checked={mode === "chat"}
                  onCheckedChange={(checked) => setMode(checked ? "chat" : "dm")}
                  disabled={isLoading}
                />
                <span className="text-xs">Чаты</span>
              </div>
            </div>

            {/* Audience Selection */}
            <div>
              <Label>Выберите базу контактов</Label>
              <Select value={audienceId} onValueChange={setAudienceId} disabled={isLoading}>
                <SelectTrigger className="glass-card border-white/20 mt-1">
                  <SelectValue placeholder="Выберите файл с результатами" />
                </SelectTrigger>
                <SelectContent className="glass-card glass-effect">
                  {audienceResults.length > 0 ? (
                    audienceResults.map((result) => (
                      <SelectItem key={result.id} value={result.id}>
                        {result.name} ({result.count})
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="empty" disabled>
                      Нет сохранённых результатов
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                или введите получателей вручную ниже
              </p>
            </div>

            {/* Manual Recipients */}
            <div>
              <Label>Ручной ввод получателей</Label>
              <Textarea
                placeholder="@username1, @username2, @username3... (через запятую или с новой строки)"
                className="glass-card border-white/20 mt-1 min-h-[80px] resize-none"
                value={manualRecipients}
                onChange={(e) => setManualRecipients(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {parseManualRecipients().length} получателей добавлено
              </p>
            </div>

            {/* Message */}
            <div>
              <Label>Текст сообщения</Label>
              <Textarea
                placeholder="Напишите ваше сообщение..."
                className="glass-card border-white/20 mt-1 min-h-[150px] resize-none"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {message.length} / 4096 символов
              </p>
            </div>

            {/* Image Upload */}
            <div>
              <Label>Изображение (опционально)</Label>
              <div className="mt-1">
                {imageThumbnail ? (
                  <div className="relative inline-block">
                    <img
                      src={imageThumbnail}
                      alt="Preview"
                      className="h-32 w-auto rounded-lg border border-white/20"
                    />
                    <button
                      onClick={handleRemoveImage}
                      disabled={isLoading}
                      className="absolute top-1 right-1 p-1 bg-destructive/80 hover:bg-destructive rounded-full text-white disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-white/20 rounded-lg cursor-pointer hover:border-white/40 transition-colors disabled:opacity-50">
                    <Upload className="w-4 h-4" />
                    <span className="text-sm">PNG или JPG (макс 5MB)</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={isLoading}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Max Recipients */}
            <div>
              <Label>Максимум получателей (опционально)</Label>
              <Input
                type="number"
                placeholder="Оставьте пустым для отправки всем"
                className="glass-card border-white/20 mt-1"
                value={maxRecipients}
                onChange={(e) => setMaxRecipients(e.target.value)}
                disabled={isLoading}
                min="1"
              />
            </div>

            {/* Delay Slider */}
            <div>
              <div className="flex items-center gap-2">
                <Label>Задержка между сообщениями (сек)</Label>
                {delaySeconds[0] < DELAY_WARNING_THRESHOLD && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertTriangle className="w-4 h-4 text-accent" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Задержка менее 2 сек повышает риск блокировки
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <div className="mt-2 flex items-center gap-4">
                <Slider
                  min={1}
                  max={10}
                  step={1}
                  value={delaySeconds}
                  onValueChange={setDelaySeconds}
                  className="flex-1"
                  disabled={isLoading}
                />
                <span className="text-sm font-medium w-12 text-right">
                  {delaySeconds[0]}s
                </span>
              </div>
            </div>

            {/* Telegram Limits Info Card */}
            <GlassCard className="bg-accent/5 border-accent/20">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-accent" />
                Лимиты Telegram
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">
                    ~30-40 сообщений в день на один аккаунт
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">
                    Рекомендуемая задержка: 2-3 сек между сообщениями
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">
                    Избегайте одинаковых сообщений подряд
                  </span>
                </div>
              </div>
            </GlassCard>

            {/* Progress Section */}
            {isLoading && (
              <div className="space-y-3 p-4 rounded-lg bg-secondary/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {progressStatus || "Отправка..."}
                  </span>
                  <span className="text-sm font-medium">
                    {sentCount} / {totalCount}
                  </span>
                </div>
                <Progress value={progress} className="h-2" />
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span>Успешно: {successCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-3 h-3 text-red-500" />
                    <span>Ошибок: {failureCount}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Summary Banner */}
            {!isLoading && sentCount > 0 && (
              <GlassCard className="bg-green-500/10 border-green-500/20">
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Рассылка завершена
                </h4>
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground">
                    Успешно отправлено: <span className="font-medium text-green-500">{successCount}</span>
                  </p>
                  {failureCount > 0 && (
                    <p className="text-muted-foreground">
                      Ошибок: <span className="font-medium text-red-500">{failureCount}</span>
                    </p>
                  )}
                </div>
              </GlassCard>
            )}

            <Button
              onClick={handleBroadcast}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 glow-effect mt-6"
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

        {/* Broadcast History Section */}
        <BroadcastHistory refreshTrigger={historyRefreshTrigger} />
      </div>
    </Layout>
  );
}
