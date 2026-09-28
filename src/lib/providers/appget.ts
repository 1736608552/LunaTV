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
    const type = site.type?.toLowerCase() || '';
    const hasAesKey = typeof site.ext === 'object' && site.ext?.dataKey;
    const api = (site.api || '').toLowerCase();
    const key = (site.key || '').toLowerCase();
    const name = (site.name || '').toLowerCase();

    return (
      type === 'appget' ||
      type === 'appqi' ||
      hasAesKey ||
      key.includes('王子') ||
      key.includes('魔方') ||
      key.includes('世界') ||
      key.includes('茉莉') ||
      name.includes('王子') ||
      name.includes('魔方') ||
      name.includes('世界') ||
      api.includes('95112475.xyz') ||
      api.includes('douy32mf.top') ||
      api.includes('4ksj.app')
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
      console.warn('[AppGetProvider] AES解密失败:', e);
      return null;
    }
  }

  private getHeaders(site: ApiSite): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    return {
      'User-Agent': 'okhttp/3.12.1',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'app-api-verify-time': timestamp,
      'app-ui-mode': 'light',
      ...(site.header || {}),
    };
  }

  async search(query: string, site: ApiSite): Promise<SearchResult[]> {
    const baseUrl = this.getBaseUrl(site);
    const { key, iv } = this.getKeys(site);
    const headers = this.getHeaders(site);

    // 标准 AppGet 协议必须是 POST 请求，且参数名为 keywords 与 page
    const searchBody = new URLSearchParams({
      keywords: query,
      page: '1',
    }).toString();

    // 尝试带 api.php 的路径，若失败则尝试兼容根路径
    const candidatePaths = [
      `${baseUrl}/api.php/getappapi.index/searchList`,
      `${baseUrl}/getappapi.index/searchList`,
    ];

    for (const searchUrl of candidatePaths) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(searchUrl, {
          method: 'POST',
          headers,
          body: searchBody,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) continue;
        const json = await res.json();
        if (!json?.data) continue;

        const decrypted = this.decrypt(json.data, key, iv);
        if (!decrypted) continue;

        const list = decrypted.search_list || decrypted.list || [];
        if (!Array.isArray(list) || list.length === 0) continue;

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
        console.warn(`[AppGetProvider] 搜索请求失败 (${searchUrl}):`, err);
      }
    }

    return [];
  }

  async detail(id: string, site: ApiSite): Promise<SearchResult | null> {
    const baseUrl = this.getBaseUrl(site);
    const { key, iv } = this.getKeys(site);
    const headers = this.getHeaders(site);

    const detailBody = new URLSearchParams({
      vod_id: String(id),
    }).toString();

    const candidatePaths = [
      `${baseUrl}/api.php/getappapi.index/vodDetail`,
      `${baseUrl}/getappapi.index/vodDetail`,
    ];

    for (const detailUrl of candidatePaths) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(detailUrl, {
          method: 'POST',
          headers,
          body: detailBody,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) continue;
        const json = await res.json();
        if (!json?.data) continue;

        const decrypted = this.decrypt(json.data, key, iv);
        if (!decrypted) continue;

        const vod = decrypted.vod || decrypted.data || decrypted;
        const title = String(vod.vod_name || id).trim();
        const poster = String(vod.vod_pic || '').trim();
        const playLists = decrypted.vod_play_list || [];

        const episodes: string[] = [];
        const episodesTitles: string[] = [];

        // 提取最佳播放线路或合并线路
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
          episodes: episodes.length > 0 ? episodes : [`${baseUrl}/api.php/getappapi.index/vodDetail?vod_id=${id}`],
          episodes_titles: episodesTitles.length > 0 ? episodesTitles : ['正片'],
          source: site.key,
          source_name: site.name,
          year: vod.vod_year ? String(vod.vod_year) : '',
          desc: cleanHtmlTags(vod.vod_content || ''),
          remarks: vod.vod_remarks || '',
        };
        return decorateSearchResultQuality(result);
      } catch (err) {
        console.warn(`[AppGetProvider] 获取详情失败 (${detailUrl}):`, err);
      }
    }

    return null;
  }
}
