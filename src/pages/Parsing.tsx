import { Layout } from "@/components/Layout";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, FileSpreadsheet, Loader2, Filter, X } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface Channel {
  id: string | number;
  accessHash?: string;
  title: string;
  link?: string | null;
  username?: string;
  membersCount: number;
  onlineCount?: number;
  description?: string;
  category?: string;
  type?: string;
  verified?: boolean;
  scam?: boolean;
  isPrivate?: boolean;
  peer?: {
    id: string;
    accessHash: string;
    type: string;
  };
}

interface ParsingResult {
  id: string;
  name: string;
  date: string;
  count: number;
  timestamp: string;
  query?: string;
}

interface ParsingResultData {
  id: string;
  userId: string;
  query: string;
  keywords?: string[];
  minMembers: number;
  maxMembers: number | null;
  channels: Channel[];
  timestamp: string;
  count: number;
}

export default function Parsing() {
  const { toast } = useToast();
  const { user } = useAuth();
  const api = useApi();
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<ParsingResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<ParsingResultData | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);
  
  const [keywordsInput, setKeywordsInput] = useState("");
  const [minMembers, setMinMembers] = useState("");
  const [maxMembers, setMaxMembers] = useState("");
  const [channelFilters, setChannelFilters] = useState({
    megagroup: true,      // Публичный чат - для парсинга аудитории
    discussion: true, // Обсуждения в каналах - для парсинга аудитории
    broadcast: true,      // Каналы - для анализа каналов
    basic: true,          // Обычные чаты
    other: false          // Прочие
  });

  // Tokenize keywords from input
  const keywords = useMemo(() => {
    if (!keywordsInput.trim()) return [];
    
    return keywordsInput
      .split(/[,\n]+/)
      .map(keyword => keyword.trim())
      .filter(keyword => keyword.length > 0)
      .filter((keyword, index, arr) => arr.indexOf(keyword) === index); // deduplicate
  }, [keywordsInput]);

  // Check if form is valid
  const isFormValid = useMemo(() => {
    const hasKeywords = keywords.length > 0;
    const hasActiveFilters = channelFilters.megagroup || channelFilters.discussion || channelFilters.broadcast;
    return hasKeywords && hasActiveFilters;
  }, [keywords, channelFilters]);

  const loadSavedResults = async () => {
    try {
      const response = await api.get('/telegram/parsing-results') as { results: ParsingResult[] };
      setFiles(response.results || []);
    } catch (e) {
      console.error('Failed to load saved results', e);
      setFiles([]);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadSavedResults();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleParsing = async () => {
    if (!user?.id) {
      toast({
        title: "Ошибка",
        description: "Необходима авторизация",
        variant: "destructive",
      });
      return;
    }

    if (!isFormValid) {
      toast({
        title: "Ошибка валидации",
        description: "Добавьте ключевые слова и выберите хотя бы одну категорию",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setSelectedResult(null);

    try {
      const min = minMembers ? Number(minMembers) : 0;
      const max = maxMembers ? Number(maxMembers) : Infinity;
      
      const response = await api.post('/telegram/search-channels', {
        keywords: keywords,
        filters: {
          minMembers: min,
          maxMembers: max === Infinity ? undefined : max,
          channelTypes: channelFilters
        },
        limits: {
          limit: 100
        },
        userId: user.id
      }) as { results: Channel[], resultsId: string, count: number };

      // Обновляем список сохранённых результатов
      await loadSavedResults();
      
      // Загружаем только что сохраненный результат для отображения
      await loadResultById(response.resultsId);
      
      toast({
        title: "Парсинг завершён",
        description: `Найдено ${response.count} каналов по ключевым словам: ${keywords.join(', ')}. Результаты сохранены.`,
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Неизвестная ошибка';
      toast({
        title: "Ошибка парсинга",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadResultById = async (resultsId: string) => {
    if (!user?.id) return;
    
    setLoadingResult(true);
    try {
      const response = await api.get(`/telegram/parsing-results/${resultsId}`) as ParsingResultData;
      setSelectedResult(response);
    } catch (e) {
      console.error('Failed to load result', e);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить результат",
        variant: "destructive",
      });
    } finally {
      setLoadingResult(false);
    }
  };

  const handleDownload = async (resultsId: string) => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
      const userId = user?.id;
      const url = `${API_BASE_URL}/telegram/parsing-results/${resultsId}/download?userId=${userId}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to download');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `channels_${resultsId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      
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

  const handleViewResult = async (resultsId: string) => {
    if (selectedResult?.id === resultsId) {
      // Если уже открыт, закрываем
      setSelectedResult(null);
    } else {
      // Загружаем результат
      await loadResultById(resultsId);
    }
  };

  const handleDownloadAll = async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
      const userId = user?.id;
      const url = `${API_BASE_URL}/telegram/parsing-results/download-all?userId=${userId}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to download');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `all_parsing_results_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      
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

  const mockUserPhoto = "https://api.dicebear.com/7.x/avataaars/svg?seed=telegram";

  return (
    <Layout backgroundImage={mockUserPhoto}>
      <div className="space-y-6 max-w-2xl mx-auto animate-slide-up">
        <GlassCard>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-2xl bg-primary/20 glow-effect">
              <Search className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Поиск каналов</h1>
              <p className="text-sm text-muted-foreground">Найдите нужные Telegram каналы</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Ключевые слова</Label>
              <div className="space-y-2">
                <textarea
                  placeholder="Введите ключевые слова через запятую или новую строку"
                  className="w-full min-h-[80px] p-3 rounded-lg glass-card border-white/20 bg-white/10 backdrop-blur-sm text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                  value={keywordsInput}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                />
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((keyword, index) => (
                      <div
                        key={index}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-primary/20 text-primary rounded-full text-xs font-medium"
                      >
                        {keyword}
                        <button
                          type="button"
                          onClick={() => {
                            const newKeywords = keywords.filter((_, i) => i !== index);
                            setKeywordsInput(newKeywords.join(', '));
                          }}
                          className="ml-1 hover:bg-primary/30 rounded-full p-0.5 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {keywords.length === 0 
                    ? "Например: технологии, бизнес, криптовалюты" 
                    : `Найдено ${keywords.length} ключев${keywords.length === 1 ? 'ое слово' : keywords.length < 5 ? 'ых слова' : 'ых слов'} для поиска`
                  }
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>От (участников)</Label>
                <Input 
                  type="number" 
                  placeholder="1000" 
                  className="glass-card border-white/20 mt-1"
                  value={minMembers}
                  onChange={(e) => setMinMembers(e.target.value)}
                />
              </div>
              <div>
                <Label>До (участников)</Label>
                <Input 
                  type="number" 
                  placeholder="100000" 
                  className="glass-card border-white/20 mt-1"
                  value={maxMembers}
                  onChange={(e) => setMaxMembers(e.target.value)}
                />
              </div>
            </div>

            <GlassCard className="bg-primary/5 border-primary/20">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                Фильтр по категориям
              </h4>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-muted-foreground">Публичный чат</span>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">Для парсинга аудитории</p>
                  </div>
                  <Switch 
                    checked={channelFilters.megagroup} 
                    onCheckedChange={checked => setChannelFilters({
                      ...channelFilters,
                      megagroup: checked
                    })} 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-muted-foreground">Каналы с комментариями</span>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">Для парсинга аудитории</p>
                  </div>
                  <Switch 
                    checked={channelFilters.discussion} 
                    onCheckedChange={checked => setChannelFilters({
                      ...channelFilters,
                      discussion: checked
                    })} 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-muted-foreground">Каналы</span>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">Не подходит для парсинга аудитории</p>
                  </div>
                  <Switch 
                    checked={channelFilters.broadcast} 
                    onCheckedChange={checked => setChannelFilters({
                      ...channelFilters,
                      broadcast: checked
                    })} 
                  />
                </div>
              </div>
              
              {/* Inline validation message */}
              {keywords.length > 0 && !channelFilters.megagroup && !channelFilters.discussion && !channelFilters.broadcast && (
                <div className="mt-3 p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-xs text-destructive">
                    Выберите хотя бы одну категорию для поиска
                  </p>
                </div>
              )}
            </GlassCard>

            <Button 
              onClick={handleParsing}
              disabled={isLoading || !isFormValid}
              className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 glow-effect mt-6"
              title={!isFormValid ? 
                (keywords.length === 0 ? "Добавьте ключевые слова" : "Выберите хотя бы одну категорию") 
                : "Начать поиск каналов"
              }
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Парсинг...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Начать парсинг
                </>
              )}
            </Button>
          </div>
        </GlassCard>

        {/* Selected Result Table */}
        {selectedResult && selectedResult.channels && selectedResult.channels.length > 0 && (
          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Результаты поиска ({selectedResult.channels.length})</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedResult.keywords && selectedResult.keywords.length > 0 
                    ? `Ключевые слова: ${selectedResult.keywords.join(', ')}`
                    : selectedResult.query 
                      ? `Запрос: "${selectedResult.query}"`
                      : 'Поиск без ключевых слов'
                  }
                  {selectedResult.minMembers > 0 && ` • От ${selectedResult.minMembers} участников`}
                  {selectedResult.maxMembers && ` • До ${selectedResult.maxMembers} участников`}
                </p>
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                className="glass-card border-white/20"
                onClick={() => handleDownload(selectedResult.id)}
              >
                <Download className="w-4 h-4 mr-2" />
                Скачать CSV
              </Button>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm custom-scrollbar">
              <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-white/20 backdrop-blur-md border-b border-white/20">
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-muted-foreground font-semibold">Название канала</TableHead>
                      <TableHead className="text-muted-foreground font-semibold">Адрес</TableHead>
                      <TableHead className="text-muted-foreground font-semibold">Категория</TableHead>
                      <TableHead className="text-muted-foreground font-semibold">Тип</TableHead>
                      <TableHead className="text-right text-muted-foreground font-semibold">Участников</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedResult.channels.map((channel, idx) => {
                       const getStatusLabel = (category?: string) => {
                          switch (category) {
                            case 'megagroup':
                              return 'Публичный чат';
                            case 'discussion':
                              return 'Каналы с комментариями';
                            case 'broadcast':
                              return 'Каналы';
                            case 'basic':
                              return 'Обычный чат';
                            case 'other':
                              return 'Прочее';
                            default:
                              return category || 'Неизвестно';
                          }
                        };
                      
                      return (
                        <TableRow 
                          key={channel.id || idx}
                          className="border-white/10 hover:bg-white/10 transition-colors"
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {channel.title}
                              {channel.verified && (
                                <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center" title="Подтверждённый канал">
                                  <span className="text-white text-xs">✓</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {channel.link ? (
                              <a
                                href={channel.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline transition-colors flex items-center gap-1"
                              >
                                {channel.username ? `@${channel.username}` : channel.id}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">ID: {channel.id}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {getStatusLabel(channel.category || channel.type)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${!channel.isPrivate ? 'bg-green-500' : 'bg-orange-500'}`} />
                              <span className="text-sm text-muted-foreground">
                                {!channel.isPrivate ? 'Публичный' : 'Приватный'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {channel.membersCount.toLocaleString('ru-RU')}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Saved Results Files */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-lg font-semibold">Экспорт данных</h3>
            {files.length > 0 && (
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
          
          {files.length === 0 ? (
            <GlassCard>
              <div className="text-center py-8">
                <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-50" />
                <p className="text-muted-foreground">Данных пока нет</p>
                <p className="text-sm text-muted-foreground mt-1">Начните поиск для получения данных</p>
              </div>
            </GlassCard>
          ) : (
            files.map((file, idx) => (
              <GlassCard key={file.id || idx} hover className={selectedResult?.id === file.id ? "ring-2 ring-primary" : ""}>
                <div className="flex items-center justify-between">
                  <div 
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => handleViewResult(file.id)}
                  >
                    <div className="p-2 rounded-xl bg-accent/20">
                      <FileSpreadsheet className="w-5 h-5 text-accent" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.count} каналов • {file.date}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewResult(file.id);
                      }}
                      title={selectedResult?.id === file.id ? "Скрыть таблицу" : "Показать таблицу"}
                    >
                      {loadingResult && selectedResult?.id === file.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="w-4 h-4" />
                      )}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(file.id);
                      }}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </GlassCard>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
