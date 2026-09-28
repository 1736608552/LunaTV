import { ApiSite } from '@/lib/config';
import { SearchResult } from '@/lib/types';

export interface SourceProvider {
  /** 驱动标识，如 'czsapp' | 'jpys' | 'aikan' | 'duboku' 等 */
  name: string;
  /** 判断该源是否由本 Provider 处理 */
  canHandle(site: ApiSite): boolean;
  /** 搜索影片列表 */
  search(query: string, site: ApiSite): Promise<SearchResult[]>;
  /** 获取特定影片详情（含播放列表与选集） */
  detail?(id: string, site: ApiSite): Promise<SearchResult | null>;
}
