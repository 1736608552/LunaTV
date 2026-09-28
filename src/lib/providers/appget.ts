/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import crypto from 'crypto';
import { ApiSite } from '../config';
import { SearchResult } from '../types';
import { cleanHtmlTags } from '../utils';
import { decorateSearchResultQuality } from '../video-quality';
import { SourceProvider } from './types';

export class AppGetProvider implements SourceProvider {
  name = 'appget';

  canHandle(site: ApiSite): boolean {
    const type = site.type?.toLowerCase();
    const hasAesKey = typeof site.ext === 'object' && site.ext?.dataKey;
    const api = site.api?.toLowerCase() || '';
    return (
      type === 'appget' ||
      type === 'appqi' ||
      hasAesKey ||
      api.includes('95112475.xyz') ||
      api.includes('douy32mf.top') ||
      api.includes('4ksj.app') ||
      api.includes('gugu3.com')
    );
  }

  private getKeys(site: ApiSite): { key: Buffer; iv: Buffer } {
    let keyStr = '5a9w6x58dsq6z3a6';
    let ivStr = '5a9w6x58dsq6z3a6';

    if (typeof site.ext === 'object' && site.ext) {
      if (site.ext.dataKey) keyStr = String(site.ext.dataKey);
      if (site.ext.dataIv) ivStr = String(site.ext.dataIv);
    }
    return {
      key: Buffer.from(keyStr, 'utf8'),
      iv: Buffer.from(ivStr, 'utf8'),
    };
  }

  private getBaseUrl(site: ApiSite): string {
    let url = site.api || '';
    if (typeof site.ext === 'object' && site.ext?.url) {
      url = String(site.ext.url);
    }
    return url.replace(/\/+$/, '');
  }

  private decrypt(cipherText: string, key: Buffer, iv: Buffer): any {
    try {
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
      let dec = decipher.update(cipherText, 'base64', 'utf8');
      dec += decipher.final('utf8');
      return JSON.parse(dec);
    } catch (e) {
      console.warn('[AppGetProvider] 解密失败:', e);
      return null;
    }
  }

  async search(query: string, site: ApiSite): Promise<SearchResult[]> {
    const baseUrl = this.getBaseUrl(site);
    const { key, iv } = this.getKeys(site);
    const searchUrl = `${baseUrl}/api.php/getappapi.index/searchList?text=${encodeURIComponent(query)}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'okhttp/3.12.1',
          Accept: 'application/json',
          ...(site.header || {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return [];
      const json = await res.json();
      if (!json?.data) return [];

      const decrypted = this.decrypt(json.data, key, iv);
      if (!decrypted) return [];

      const list = decrypted.search_list || decrypted.list || [];
      if (!Array.isArray(list)) return [];

      return list.map((item: any) => {
        const id = String(item.vod_id || item.id || '').trim();
        const title = String(item.vod_name || item.name || '').trim();
        const poster = String(item.vod_pic || item.pic || '').trim();
        const remarks = String(item.vod_remarks || '');

        const result: SearchResult = {
          id,
          title: cleanHtmlTags(title),
          poster,
          episodes: [`${baseUrl}/api.php/getappapi.index/vodDetail?vod_id=${id}`],
          episodes_titles: ['全集/详情'],
          source: site.key,
          source_name: site.name,
          year: item.vod_year ? String(item.vod_year) : '',
          class: item.vod_class || '',
          desc: cleanHtmlTags(item.vod_content || ''),
          remarks,
          quality_tag: remarks || '4K原画/秒播',
        };
        return decorateSearchResultQuality(result, remarks);
      });
    } catch (err) {
      console.warn(`[AppGetProvider] 搜索请求失败:`, err);
      return [];
    }
  }

  async detail(id: string, site: ApiSite): Promise<SearchResult | null> {
    const baseUrl = this.getBaseUrl(site);
    const { key, iv } = this.getKeys(site);
    const detailUrl = `${baseUrl}/api.php/getappapi.index/vodDetail?vod_id=${id}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(detailUrl, {
        headers: {
          'User-Agent': 'okhttp/3.12.1',
          Accept: 'application/json',
          ...(site.header || {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const json = await res.json();
      if (!json?.data) return null;

      const decrypted = this.decrypt(json.data, key, iv);
      if (!decrypted) return null;

      const vod = decrypted.vod || decrypted.data || decrypted;
      const title = String(vod.vod_name || id).trim();
      const poster = String(vod.vod_pic || '').trim();
      const playLists = decrypted.vod_play_list || [];

      const episodes: string[] = [];
      const episodesTitles: string[] = [];

      // 提取最佳播放列表
      if (Array.isArray(playLists) && playLists.length > 0) {
        // 优先选取包含 urls 且数量最多或包含 m3u8 的线路
        let bestList = playLists[0];
        for (const pl of playLists) {
          if (Array.isArray(pl.urls) && pl.urls.length > (bestList.urls?.length || 0)) {
            bestList = pl;
          }
        }

        if (Array.isArray(bestList.urls)) {
          bestList.urls.forEach((u: any, idx: number) => {
            const epUrl = u.url || u.parse_api_url;
            const epName = u.name || `第${idx + 1}集`;
            if (epUrl) {
              episodes.push(epUrl);
              episodesTitles.push(epName);
            }
          });
        }
      }

      const result: SearchResult = {
        id,
        title: cleanHtmlTags(title),
        poster,
        episodes: episodes.length > 0 ? episodes : [detailUrl],
        episodes_titles: episodesTitles.length > 0 ? episodesTitles : ['正片'],
        source: site.key,
        source_name: site.name,
        year: vod.vod_year ? String(vod.vod_year) : '',
        desc: cleanHtmlTags(vod.vod_content || ''),
        remarks: vod.vod_remarks || '',
      };
      return decorateSearchResultQuality(result);
    } catch (err) {
      console.warn(`[AppGetProvider] 获取详情失败:`, err);
      return null;
    }
  }
}
