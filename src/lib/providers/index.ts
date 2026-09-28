import { ApiSite } from '@/lib/config';
import { SourceProvider } from '@/lib/providers/types';
import { CzsappProvider } from '@/lib/providers/czsapp';
import { JpysProvider } from '@/lib/providers/jpys';
import { DubokuProvider } from '@/lib/providers/duboku';
import { AikanProvider } from '@/lib/providers/aikan';
import { ReboProvider } from '@/lib/providers/rebo';
import { C1905Provider } from '@/lib/providers/c1905';
import { AppGetProvider } from '@/lib/providers/appget';

// 注册所有协议驱动 Provider 实例（解耦设计，源本身不写死，纯靠驱动匹配）
const providers: SourceProvider[] = [
  new AppGetProvider(),
  new CzsappProvider(),
  new JpysProvider(),
  new DubokuProvider(),
  new AikanProvider(),
  new ReboProvider(),
  new C1905Provider(),
];

/**
 * 根据源的配置特征（type、api 或 ext）动态查找匹配的专线协议处理器
 * 若返回 null，则说明是标准苹果 CMS 规范源，下游将继续执行默认的 videolist 逻辑
 */
export function findProvider(site: ApiSite): SourceProvider | null {
  for (const provider of providers) {
    if (provider.canHandle(site)) {
      return provider;
    }
  }
  return null;
}

export * from '@/lib/providers/types';
export * from '@/lib/providers/czsapp';
export * from '@/lib/providers/jpys';
export * from '@/lib/providers/duboku';
export * from '@/lib/providers/aikan';
export * from '@/lib/providers/rebo';
export * from '@/lib/providers/c1905';
export * from '@/lib/providers/appget';

