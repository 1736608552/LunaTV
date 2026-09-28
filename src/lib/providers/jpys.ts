/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import crypto from 'crypto';
import { ApiSite } from '@/lib/config';
import { SearchResult } from '@/lib/types';
import { cleanHtmlTags } from '@/lib/utils';
import { decorateSearchResultQuality } from '@/lib/video-quality';
import { SourceProvider } from '@/lib/providers/types';

const DEFAULT_BASE_URL = 'https://www.hkybqufgh.com';
const SIGN_KEY = 'cb808529bae6b6be45ecfab29a4889bc';

export class JpysProvider implements SourceProvider {
  name = 'jpys';

  canHandle(site: ApiSite): boolean {
    const type = site.type?.toLowerCase();
    const api = site.api?.toLowerCase() || '';
    return (
      type === 'jpys' ||
      type === 'jinpai' ||
      api.includes('hkybqufgh') ||
      api.includes('y2s52n7')
    );
  }

  private getBaseUrl(site: ApiSite): string {
    if (site.api && site.api.startsWith('http')) {
      return site.api.replace(/\/+$/, '');
    }
    return DEFAULT_BASE_URL;
  }

  private async getServerTime(baseUrl: string): Promise<number> {
    try {
      const res = await fetch(`${baseUrl}/api/mw-movie/anonymous/home/hotSearch`, {
        method: 'HEAD',
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const dateHeader = res.headers.get('date');
      if (dateHeader) {
        const parsed = Date.parse(dateHeader);
        if (!isNaN(parsed)) return parsed;
      }
    } catch {
      // 忽略错误，回退到本地时间
    }
    return Date.now();
  }

  private createSign(rawStr: string): string {
    return crypto.createHash('sha1').update(rawStr, 'utf8').digest('hex');
  }

  async search(query: string, site: ApiSite): Promise<SearchResult[]> {
    const baseUrl = this.getBaseUrl(site);
    const serverTimestamp = await this.getServerTime(baseUrl);
    const t = String(serverTimestamp);

    // 计算签名: keyword=xxx&pageNum=1&pageSize=8&key=...&t=...
    const rawParam = `keyword=${query}&pageNum=1&pageSize=8&key=${SIGN_KEY}&t=${t}`;
    const sign = this.createSign(rawParam);

    const searchUrl = `${baseUrl}/api/mw-movie/anonymous/video/searchByWord?keyword=${encodeURIComponent(query)}&pageNum=1&pageSize=8`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          sign,
          T: t,
          Deviceid: '1234567890abcdef',
          Accept: 'application/json',
          ...(site.header || {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return [];
      const json = await res.json();
      const list = json?.data?.list || json?.data?.result?.list || [];
      if (!Array.isArray(list)) return [];

      return list.map((item: any) => {
        const id = String(item.vodId || item.id || '');
        const title = String(item.vodName || item.title || '').trim();
        const poster = String(item.vodPic || item.pic || '').trim();
        const remarks = String(item.vodRemarks || item.vodVersion || '');

        const result: SearchResult = {
          id,
          title: cleanHtmlTags(title),
          poster,
          episodes: [`${baseUrl}/api/mw-movie/anonymous/video/detail?id=${id}`],
          episodes_titles: ['全集/详情'],
          source: site.key,
          source_name: site.name,
          class: item.vodClass || '',
          year: item.vodYear ? String(item.vodYear) : '',
          desc: cleanHtmlTags(item.vodContent || item.vodBlurb || ''),
          type_name: item.vodClass || '影视',
          remarks,
          quality_tag: remarks || '超清专线',
        };
        return decorateSearchResultQuality(result, remarks);
      });
    } catch (err) {
      console.warn(`[JpysProvider] 搜索失败:`, err);
      return [];
    }
  }

  async detail(id: string, site: ApiSite): Promise<SearchResult | null> {
    const baseUrl = this.getBaseUrl(site);
    const serverTimestamp = await this.getServerTime(baseUrl);
    const t = String(serverTimestamp);

    const rawParam = `id=${id}&key=${SIGN_KEY}&t=${t}`;
    const sign = this.createSign(rawParam);
    const detailUrl = `${baseUrl}/api/mw-movie/anonymous/video/detail?id=${id}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(detailUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          sign,
          T: t,
          Deviceid: '1234567890abcdef',
          Accept: 'application/json',
          ...(site.header || {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const json = await res.json();
      const data = json?.data;
      if (!data) return null;

      const title = String(data.vodName || id).trim();
      const poster = String(data.vodPic || '').trim();
      const episodeList = data.episodeList || [];

      const episodes: string[] = [];
      const episodesTitles: string[] = [];

      if (Array.isArray(episodeList)) {
        episodeList.forEach((ep: any, index: number) => {
          const epTitle = ep.name || `第${index + 1}集`;
          const epUrl = ep.url || `${baseUrl}/api/mw-movie/anonymous/v2/video/episode/url?id=${id}&nid=${ep.nid || index + 1}`;
          episodes.push(epUrl);
          episodesTitles.push(epTitle);
        });
      }

      const result: SearchResult = {
        id,
        title: cleanHtmlTags(title),
        poster,
        episodes: episodes.length > 0 ? episodes : [detailUrl],
        episodes_titles: episodesTitles.length > 0 ? episodesTitles : ['正片'],
        source: site.key,
        source_name: site.name,
        desc: cleanHtmlTags(data.vodContent || data.vodBlurb || ''),
        year: data.vodYear ? String(data.vodYear) : '',
        remarks: data.vodRemarks || '',
      };
      return decorateSearchResultQuality(result);
    } catch (err) {
      console.warn(`[JpysProvider] 获取详情失败:`, err);
      return null;
    }
  }
}
