import { Layout } from "@/components/Layout";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Users, TrendingUp, Download, Loader2, FileSpreadsheet } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi, apiDownload } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { sanitizeAvatarUrl } from "@/lib/sanitize";

interface ParsingSession {
  id: string;
  name: string;
  count: number;
  timestamp: string;
  keywords: string[];
  enriched?: boolean;
  version?: string;
}

interface AudienceResult {
  id: string;
  name: string;
  date: string;
  count: number;
  timestamp: string;
  chatId?: string;
  sessionId?: string | null;
  version?: string;
  participantsLimit?: number | null;
  bioKeywords?: string[] | null;
  channelsProcessed?: number | null;
  totalChannels?: number | null;
}

export default function Audience() {
  const { toast } = useToast();
  const { user } = useAuth();
  const api = useApi();
  const backgroundImage = sanitizeAvatarUrl(user?.photo_url ?? null) || undefined;
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [selectedSession, setSelectedSession] = useState<ParsingSession | null>(null);
  const [chatLink, setChatLink] = useState("");
  const [criteria, setCriteria] = useState({
    likes: true,
    comments: true,
    reposts: true,
    frequency: true
  });
  const [lastDays, setLastDays] = useState("30");
  const [minActivity, setMinActivity] = useState("5");
  const [parsingSessions, setParsingSessions] = useState<ParsingSession[]>([]);
  const [audienceFiles, setAudienceFiles] = useState<AudienceResult[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [engagementRate, setEngagementRate] = useState(0);
  const [participantsLimit, setParticipantsLimit] = useState<string>("");
  const [bioKeywords, setBioKeywords] = useState<string>("");
  const [searchProgress, setSearchProgress] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  const loadAudienceResults = async () => {
    if (!user?.id) return;
    
    try {
      const response = await api.get('/telegram/audience-results') as { results: AudienceResult[] };
      setAudienceFiles(response.results || []);
    } catch (e) {
      console.error('Failed to load audience results', e);
      setAudienceFiles([]);
    }
  };

  const loadParsingSessions = async () => {
    if (!user?.id) return;
    
    try {
      const response = await api.get('/telegram/parsing-results') as { results: ParsingSession[] };
      setParsingSessions(response.results || []);
    } catch (e) {
      console.error('Failed to load parsing sessions', e);
      setParsingSessions([]);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadAudienceResults();
      loadParsingSessions();
    } else {
      setParsingSessions([]);
      setAudienceFiles([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!selectedSessionId) {
      setSelectedSession(null);
      return;
    }

    const session = parsingSessions.find((item) => item.id === selectedSessionId);
    if (session) {
      setSelectedSession(session);
    } else {
      setSelectedSessionId("");
      setSelectedSession(null);
    }
  }, [parsingSessions, selectedSessionId]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const handleParsing = async () => {
    if (!user?.id) {
      toast({
        title: "Ошибка",
        description: "Необходима авторизация",
        variant: "destructive",
      });
      return;
    }

    // Validate required fields
    if (!selectedSessionId && !chatLink) {
      toast({
        title: "Ошибка",
        description: "Выберите сессию парсинга или введите ссылку на канал",
        variant: "destructive",
      });
      return;
    }

    // Validate required participantsLimit
    if (!participantsLimit || !participantsLimit.trim()) {
      toast({
        title: "Ошибка",
        description: "Укажите лимит участников (обязательное поле)",
        variant: "destructive",
      });
      return;
    }

    const limitNum = Number(participantsLimit);
    if (isNaN(limitNum) || limitNum <= 0) {
      toast({
        title: "Ошибка",
        description: "Лимит участников должен быть положительным числом",
        variant: "destructive",
      });
      return;
    }

    // Clear stats before starting
    setIsLoading(true);
    setActiveCount(0);
    setEngagementRate(0);
    setSearchProgress(0);

    try {
      const requestBody: Record<string, unknown> = {
        lastDays: Number(lastDays) || 30,
        criteria: criteria,
        minActivity: Number(minActivity) || 0,
        userId: user.id,
        participantsLimit: limitNum
      };
      
      // Parse bio keywords - support both comma and newline separation
      if (bioKeywords.trim()) {
        const keywords = bioKeywords
          .split(/[,\n]/)
          .map(k => k.trim())
          .filter(k => k.length > 0);
        
        if (keywords.length > 0) {
          requestBody.bioKeywords = keywords;
        }
      }

      // Determine parsing mode
      if (selectedSessionId) {
        // Session-based parsing
        requestBody.sessionId = selectedSessionId;
      } else if (chatLink) {
        // Manual link parsing
        const match = chatLink.match(/(?:https?:\/\/)?(?:t\.me\/|@)(\w+)/);
        if (match) {
          requestBody.chatId = match[1];
        } else {
          toast({
            title: "Ошибка",
            description: "Неверный формат ссылки на канал",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }
      }
      
      const response = await api.post('/telegram/parse', requestBody) as { taskId: string };

      // Track task progress via SSE
      const API_BASE_URL = import.meta.env.PROD 
        ? '/api' 
        : (import.meta.env.VITE_API_URL || '/api');
      const sseUrl = `${API_BASE_URL}/tasks/${response.taskId}/stream?userId=${encodeURIComponent(user.id)}`;
      console.log('[PROGRESS] Opening SSE connection:', sseUrl);
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;
      
      eventSource.onopen = () => {
        console.log('[PROGRESS] SSE connection opened');
      };

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('[PROGRESS] SSE message received:', {
          status: data.status,
          progress: data.progress,
          current: data.current,
          limit: data.limit,
          total: data.total,
          message: data.message
        });
        
        if (data.status === 'completed') {
          console.log('[PROGRESS] Task completed');
          eventSource.close();
          eventSourceRef.current = null;
          setIsLoading(false);
          
          const active = Number(data.result?.active) || 0;
          const totalFound = Number(data.result?.totalFound) || 0;
          const limitForResult = Number(
            data.result?.limit ??
            data.result?.total ??
            data.result?.participantsLimit ??
            limitNum
          ) || limitNum;
          
          setActiveCount(active);
          setEngagementRate(limitForResult > 0 ? Math.round((active / limitForResult) * 100) : 0);
          
          // Refresh audience results list
          loadAudienceResults();
          
          const resultMessage = data.result?.sessionId 
            ? `Найдено ${active} пользователей из ${totalFound} по ${data.result?.channelsProcessed || 0} каналам`
            : `Найдено ${active} активных пользователей из ${limitForResult}`;
          
          toast({
            title: "Аудитория найдена",
            description: resultMessage,
          });
        } else if (data.status === 'failed') {
          console.log('[PROGRESS] Task failed:', data.error);
          eventSource.close();
          eventSourceRef.current = null;
          setIsLoading(false);
          toast({
            title: "Ошибка",
            description: data.error || "Не удалось найти активную аудиторию",
            variant: "destructive",
          });
        } else if (data.status === 'running') {
          // Update progress with current/limit from SSE
          const current = Number(data.current) || 0;
          const limit = Number(data.limit ?? data.total ?? limitNum) || limitNum;
          const progressPercent = limit > 0 ? Math.round((current / limit) * 100) : 0;
          
          console.log('[PROGRESS] Progress update:', {
            current,
            limit,
            progressPercent,
            message: data.message
          });
          
          setActiveCount(current);
          setEngagementRate(limit > 0 ? Math.round((current / limit) * 100) : 0);
          setSearchProgress(progressPercent);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        setIsLoading(false);
        toast({
          title: "Ошибка",
          description: "Не удалось подключиться к серверу",
          variant: "destructive",
        });
      };
    } catch (e: unknown) {
      setIsLoading(false);
      const errorMessage = e instanceof Error ? e.message : 'Неизвестная ошибка';
      toast({
        title: "Ошибка поиска",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (resultsId: string) => {
    try {
      await apiDownload(`/telegram/audience-results/${resultsId}/download`, user?.id);
      
      toast({
        title: "Успешно",
        description: "Файл скачан",
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Неизвестная ошибка';
      toast({
        title: "Ошибка скачивания",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleDownloadAll = async () => {
    try {
      await apiDownload(`/telegram/audience-results/download-all`, user?.id);
      
      toast({
        title: "Успешно",
        description: "Все результаты скачаны",
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Неизвестная ошибка';
      toast({
        title: "Ошибка скачивания",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };
  return <Layout backgroundImage={backgroundImage}>
      <div className="space-y-6 max-w-2xl mx-auto animate-slide-up">
        <GlassCard>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-2xl bg-accent/20 glow-effect">
              <Users className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Активная аудитория</h1>
              <p className="text-sm text-muted-foreground">Найдите вовлечённых пользователей</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Сохранённые сессии</Label>
              <Select
                value={selectedSessionId}
                onValueChange={(value) => {
                  if (value === "__none") {
                    setSelectedSessionId("");
                    setSelectedSession(null);
                    return;
                  }
                  setSelectedSessionId(value);
                  const session = parsingSessions.find((s) => s.id === value);
                  setSelectedSession(session || null);
                }}
              >
                <SelectTrigger className="glass-card border-white/20 mt-1">
                  <SelectValue placeholder="Выберите сессию для анализа" />
                </SelectTrigger>
                <SelectContent className="glass-card glass-effect">
                  {parsingSessions.length > 0 ? (
                    <>
                      <SelectItem value="__none">Без сессии</SelectItem>
                      {parsingSessions.map((session) => (
                        <SelectItem key={session.id} value={session.id}>
                          {session.name} • {session.count} каналов
                        </SelectItem>
                      ))}
                    </>
                  ) : (
                    <SelectItem value="empty" disabled>
                      {user?.id ? "Нет сохранённых сессий парсинга" : "Необходима авторизация"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Используйте сохранённые сессии, чтобы обработать сразу несколько каналов
              </p>
              {selectedSession && (
                <p className="text-xs text-primary mt-1">
                  Выбрана сессия: {selectedSession.count} каналов • {new Date(selectedSession.timestamp).toLocaleString("ru-RU")}
                </p>
              )}
            </div>

            <div>
              <Label>Ссылка на канал / чат</Label>
              <Input
                placeholder="https://t.me/channelname или @channelname"
                className="glass-card border-white/20 mt-1"
                value={chatLink}
                onChange={(e) => setChatLink(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Оставьте поле пустым, если используете сохранённую сессию
              </p>
            </div>

            {/* Enhanced filtering options */}
            <GlassCard className="bg-primary/5 border-primary/20">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Критерии активности
              </h4>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Лайки и реакции</span>
                  <Switch checked={criteria.likes} onCheckedChange={checked => setCriteria({
                  ...criteria,
                  likes: checked
                })} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Комментарии</span>
                  <Switch checked={criteria.comments} onCheckedChange={checked => setCriteria({
                  ...criteria,
                  comments: checked
                })} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Репосты</span>
                  <Switch checked={criteria.reposts} onCheckedChange={checked => setCriteria({
                  ...criteria,
                  reposts: checked
                })} />
                </div>
                
              </div>
            </GlassCard>

            {/* Additional filters */}
            <GlassCard className="bg-accent/5 border-accent/20">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" />
                Дополнительные фильтры
              </h4>
              <div className="space-y-4">
                <div>
                  <Label>Количество участников</Label>
                  <Input
                    type="number"
                    min={1}
                    required
                    placeholder="Введите число"
                    className="glass-card border-white/20 mt-1"
                    value={participantsLimit}
                    onChange={(e) => setParticipantsLimit(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Обязательное поле. Укажите максимальное количество пользователей для сбора</p>
                </div>
                
                <div>
                  <Label>Ключи в био</Label>
                  <Input
                    placeholder="бизнес, инвестиции, стартап"
                    className="glass-card border-white/20 mt-1"
                    value={bioKeywords}
                    onChange={(e) => setBioKeywords(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Через запятую или с новой строки. Поиск без учета регистра</p>
                </div>
              </div>
            </GlassCard>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Период анализа</Label>
                <Input 
                  type="number" 
                  placeholder="30" 
                  className="glass-card border-white/20 mt-1"
                  value={lastDays}
                  onChange={(e) => setLastDays(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">дней</p>
              </div>
              <div>
                <Label>Мин. активность</Label>
                <Input 
                  type="number" 
                  placeholder="5" 
                  className="glass-card border-white/20 mt-1"
                  value={minActivity}
                  onChange={(e) => setMinActivity(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">действий</p>
              </div>
            </div>

            <Button onClick={handleParsing} disabled={isLoading} className="w-full bg-gradient-to-r from-accent to-primary hover:opacity-90 glow-effect mt-6">
              {isLoading ? <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Поиск...
                </> : <>
                  <Users className="w-4 h-4 mr-2" />
                  Начать поиск
                </>}
            </Button>
          </div>
        </GlassCard>

        {/* Progress Bar */}
        {isLoading && (
          <GlassCard className="animate-fade-in">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm font-medium">Поиск активной аудитории...</span>
                </div>
                <span className="text-sm font-bold text-primary">{searchProgress}%</span>
              </div>
              <Progress 
                value={searchProgress} 
                className="h-2 glass-card border-white/10"
              />
              <p className="text-xs text-muted-foreground text-center">
                Обработано {activeCount} пользователей
              </p>
            </div>
          </GlassCard>
        )}

        {/* Statistics */}
        <div className="grid grid-cols-2 gap-3">
          <GlassCard className="text-center">
            <div className="p-3 rounded-2xl bg-primary/20 w-fit mx-auto mb-3">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <p className="text-2xl font-bold">{activeCount}</p>
            <p className="text-sm text-muted-foreground">Активных</p>
          </GlassCard>
          
          <GlassCard className="text-center">
            <div className="p-3 rounded-2xl bg-accent/20 w-fit mx-auto mb-3">
              <TrendingUp className="w-6 h-6 text-accent" />
            </div>
            <p className="text-2xl font-bold">{engagementRate}%</p>
            <p className="text-sm text-muted-foreground">Вовлечённость</p>
          </GlassCard>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-lg font-semibold">Экспорт данных</h3>
            {audienceFiles.length > 0 && (
              <Button 
                size="sm" 
                variant="outline" 
                className="glass-card border-white/20"
                onClick={handleDownloadAll}
              >
                <Download className="w-4 h-4 mr-2" />
                Скачать все
              </Button>
            )}
          </div>

          {audienceFiles.length === 0 ? (
            <GlassCard>
              <div className="text-center py-8">
                <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-50" />
                <p className="text-muted-foreground">Данных пока нет</p>
                <p className="text-sm text-muted-foreground mt-1">Начните поиск для получения данных</p>
              </div>
            </GlassCard>
          ) : (
            audienceFiles.map((file, idx) => (
              <GlassCard key={file.id || idx} hover>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-accent/20">
                      <FileSpreadsheet className="w-5 h-5 text-accent" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.count} пользователей • {file.date}
                      </p>
                      {/* Additional metadata for enhanced results */}
                      {file.version === '2.0' && (
                        <div className="flex items-center gap-2 mt-1">
                          {file.sessionId && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                              Сессия
                            </span>
                          )}
                          {file.participantsLimit && (
                            <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded">
                              Лимит: {file.participantsLimit}
                            </span>
                          )}
                          {file.channelsProcessed && file.totalChannels && (
                            <span className="text-xs bg-muted/50 px-2 py-0.5 rounded">
                              {file.channelsProcessed}/{file.totalChannels} каналов
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => handleDownload(file.id)}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </GlassCard>
            ))
          )}
        </div>
      </div>
    </Layout>;
}