/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import { ApiSite } from '@/lib/config';
import { SearchResult } from '@/lib/types';
import { cleanHtmlTags } from '@/lib/utils';
import { decorateSearchResultQuality } from '@/lib/video-quality';
import { SourceProvider } from '@/lib/providers/types';

const DEFAULT_BASE_URL = 'http://43.248.117.123:4680';

export class AikanProvider implements SourceProvider {
  name = 'aikan';

  canHandle(site: ApiSite): boolean {
    const type = site.type?.toLowerCase();
    const api = site.api?.toLowerCase() || '';
    return (
      type === 'aikan' ||
      api.includes('43.248.117.123')
    );
  }

  private getBaseUrl(site: ApiSite): string {
    if (site.api && site.api.startsWith('http')) {
      return site.api.replace(/\/+$/, '');
    }
    return DEFAULT_BASE_URL;
  }

  async search(query: string, site: ApiSite): Promise<SearchResult[]> {
    const baseUrl = this.getBaseUrl(site);
    const url = `${baseUrl}/apptov5/v1/search/lists?wd=${encodeURIComponent(query)}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'okhttp/4.9.3',
          Accept: 'application/json',
          ...(site.header || {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return [];
      const json = await res.json();
      const list = json?.data?.list || json?.list || [];
      if (!Array.isArray(list)) return [];

      return list.map((item: any) => {
        const id = String(item.vod_id || item.id || '');
        const title = String(item.vod_name || item.name || '').trim();
        const poster = String(item.vod_pic || item.pic || '').trim();
        const remarks = String(item.vod_remarks || '');

        let episodes: string[] = [];
        let titles: string[] = [];

        if (item.play_url) {
          const parts = String(item.play_url).split('#');
          parts.forEach((p, idx) => {
            const pair = p.split('$');
            if (pair.length >= 2) {
              titles.push(pair[0]);
              episodes.push(pair[1]);
            } else {
              titles.push(`第${idx + 1}集`);
              episodes.push(pair[0]);
            }
          });
        }

        const result: SearchResult = {
          id,
          title: cleanHtmlTags(title),
          poster,
          episodes: episodes.length > 0 ? episodes : [`${baseUrl}/apptov5/v1/vod/getVod?id=${id}`],
          episodes_titles: titles.length > 0 ? titles : ['详情/播放'],
          source: site.key,
          source_name: site.name,
          class: item.vod_class || '',
          year: item.vod_year || '',
          desc: cleanHtmlTags(item.vod_content || item.vod_blurb || ''),
          remarks,
          quality_tag: remarks || 'APP专线',
        };
        return decorateSearchResultQuality(result, remarks);
      });
    } catch (err) {
      console.warn(`[AikanProvider] 搜索失败:`, err);
      return [];
    }
  }

  async detail(id: string, site: ApiSite): Promise<SearchResult | null> {
    const baseUrl = this.getBaseUrl(site);
    const url = `${baseUrl}/apptov5/v1/vod/getVod?id=${id}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'okhttp/4.9.3',
          Accept: 'application/json',
          ...(site.header || {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const json = await res.json();
      const data = json?.data || json;
      if (!data) return null;

      const title = String(data.vod_name || id).trim();
      const poster = String(data.vod_pic || '').trim();

      const episodes: string[] = [];
      const titles: string[] = [];

      if (data.play_url) {
        const parts = String(data.play_url).split('#');
        parts.forEach((p, idx) => {
          const pair = p.split('$');
          if (pair.length >= 2) {
            titles.push(pair[0]);
            episodes.push(pair[1]);
          } else {
            titles.push(`第${idx + 1}集`);
            episodes.push(pair[0]);
          }
        });
      }

      const result: SearchResult = {
        id,
        title: cleanHtmlTags(title),
        poster,
        episodes,
        episodes_titles: titles,
        source: site.key,
        source_name: site.name,
        desc: cleanHtmlTags(data.vod_content || ''),
        year: data.vod_year || '',
        remarks: data.vod_remarks || '',
      };
      return decorateSearchResultQuality(result);
    } catch (err) {
      console.warn(`[AikanProvider] 获取详情失败:`, err);
      return null;
    }
  }
}
