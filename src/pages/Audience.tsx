import { Layout } from "@/components/Layout";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Users, TrendingUp, Download, Loader2, FileSpreadsheet } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi, apiDownload } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface Peer {
  id: string;
  accessHash: string;
  type: string;
}

interface Channel {
  id: string;
  title: string;
  address: string;
  username?: string;
  membersCount: number;
  type?: string;
  parsingResultId?: string;
  parsingResultName?: string;
  peer?: Peer;
}

interface AudienceResult {
  id: string;
  name: string;
  date: string;
  count: number;
  timestamp: string;
  chatId?: string;
}

export default function Audience() {
  const { toast } = useToast();
  const { user } = useAuth();
  const api = useApi();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [chatLink, setChatLink] = useState("");
  const [criteria, setCriteria] = useState({
    likes: true,
    comments: true,
    reposts: true,
    frequency: true
  });
  const [lastDays, setLastDays] = useState("30");
  const [minActivity, setMinActivity] = useState("5");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [audienceFiles, setAudienceFiles] = useState<AudienceResult[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [engagementRate, setEngagementRate] = useState(0);

  const loadChannels = async () => {
    if (!user?.id) {
      console.log('loadChannels: No user ID');
      return;
    }
    
    try {
      console.log('loadChannels: Loading channels for user', user.id);
      const response = await api.get('/telegram/parsing-results/channels') as { channels: Channel[] };
      console.log('loadChannels: Response received', { channelsCount: response.channels?.length || 0, channels: response.channels });
      setChannels(response.channels || []);
    } catch (e) {
      console.error('Failed to load channels', e);
      setChannels([]);
    }
  };

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

  useEffect(() => {
    if (user?.id) {
      console.log('Audience: User ID changed, loading channels', user.id);
      loadChannels();
      loadAudienceResults();
    } else {
      console.log('Audience: No user ID, clearing channels');
      setChannels([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  const mockUserPhoto = "https://api.dicebear.com/7.x/avataaars/svg?seed=telegram";

  const handleParsing = async () => {
    if (!user?.id) {
      toast({
        title: "Ошибка",
        description: "Необходима авторизация",
        variant: "destructive",
      });
      return;
    }

    // Determine what to send - prefer peer object from parsed results, fallback to manual link
    let chat: Peer | string | undefined;
    
    if (selectedChannel) {
      // For selected channel, use peer data if available, otherwise construct from id
      if (selectedChannel.peer) {
        chat = selectedChannel.peer;
      } else {
        // Fallback if peer data not available (legacy)
        chat = selectedChannel.username || selectedChannel.id;
      }
    } else if (chatLink) {
      // For manual links, extract identifier and send as string (legacy)
      const match = chatLink.match(/(?:https?:\/\/)?(?:t\.me\/|@)(\w+)/);
      if (match) {
        chat = match[1];
      } else {
        toast({
          title: "Ошибка",
          description: "Неверный формат ссылки на канал",
          variant: "destructive",
        });
        return;
      }
    }

    if (!chat) {
      toast({
        title: "Ошибка",
        description: "Выберите канал или введите ссылку",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setActiveCount(0);
    setEngagementRate(0);

    try {
      const requestBody: Record<string, unknown> = {
        lastDays: Number(lastDays) || 30,
        criteria: criteria,
        minActivity: Number(minActivity) || 0,
        userId: user.id
      };
      
      // Send peer object if available, otherwise send as legacy chatId
      if (typeof chat === 'object' && chat.id) {
        requestBody.peer = chat;
      } else {
        requestBody.chatId = chat;
      }
      
      const response = await api.post('/telegram/parse', requestBody) as { taskId: string };

      // Отслеживаем прогресс задачи через SSE
      // In production, use relative '/api' to avoid port issues
      const API_BASE_URL = import.meta.env.PROD 
        ? '/api' 
        : (import.meta.env.VITE_API_URL || '/api');
      const eventSource = new EventSource(`${API_BASE_URL}/tasks/${response.taskId}/stream?userId=${encodeURIComponent(user.id)}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.status === 'completed') {
          eventSource.close();
          setIsLoading(false);
          setActiveCount(data.result?.active || 0);
          const total = data.result?.total || 0;
          setEngagementRate(total > 0 ? Math.round((data.result?.active || 0) / total * 100) : 0);
          
          // Обновляем список результатов
          loadAudienceResults();
          
          toast({
            title: "Аудитория найдена",
            description: `Найдено ${data.result?.active || 0} активных пользователей из ${total}`,
          });
        } else if (data.status === 'failed') {
          eventSource.close();
          setIsLoading(false);
          toast({
            title: "Ошибка",
            description: data.error || "Не удалось найти активную аудиторию",
            variant: "destructive",
          });
        } else if (data.status === 'running') {
          // Обновляем прогресс
          const progress = data.progress || 0;
          const current = data.current || 0;
          const total = data.total || 0;
          if (total > 0) {
            setActiveCount(current);
            setEngagementRate(Math.round(current / total * 100));
          }
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
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
  return <Layout backgroundImage={mockUserPhoto}>
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
              <Label>Выберите базу каналов/чатов {channels.length > 0 && `(${channels.length} каналов)`}</Label>
              <Select 
                value={selectedChannelId} 
                onValueChange={(value) => {
                  setSelectedChannelId(value);
                  const channel = channels.find(ch => ch.id === value);
                  setSelectedChannel(channel || null);
                }}
              >
                <SelectTrigger className="glass-card border-white/20 mt-1">
                  <SelectValue placeholder="Выберите результаты парсинга" />
                </SelectTrigger>
                <SelectContent className="glass-card glass-effect">
                  {channels.length > 0 ? (
                    channels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        {channel.title} ({channel.membersCount.toLocaleString('ru-RU')}){channel.type ? ` - ${channel.type}` : ''}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="empty" disabled>
                      {user?.id ? 'Нет сохранённых результатов парсинга' : 'Необходима авторизация'}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Ссылка на канал / чат</Label>
              <Input 
                placeholder="https://t.me/channelname или @channelname" 
                className="glass-card border-white/20 mt-1"
                value={chatLink}
                onChange={(e) => setChatLink(e.target.value)}
              />
            </div>

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
                    <div>
                      <p className="font-medium text-sm">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.count} пользователей • {file.date}
                      </p>
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