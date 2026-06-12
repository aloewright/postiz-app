import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { EmdashDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/emdash.dto';
import { Integration } from '@prisma/client';
import dayjs from 'dayjs';
import slugify from 'slugify';

// Self-hosted EmDash CMS (https://emdashcms.com). The REST API lives at
// `<domain>/_emdash/api/` and authenticates with a Bearer API token the user
// generates in their EmDash admin. Content is created as a draft (the create
// endpoint only accepts status "draft") then published via a separate route.
type EmdashCreds = { domain: string; apiKey: string; collection: string };

export class EmdashProvider extends SocialAbstract implements SocialProvider {
  identifier = 'emdash';
  name = 'EmDash';
  isBetweenSteps = false;
  editor = 'normal' as const;
  scopes = [] as string[];
  override maxConcurrentJob = 5;
  dto = EmdashDto;

  maxLength() {
    return 100000;
  }

  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url: state,
      codeVerifier: makeId(10),
      state,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  async customFields() {
    return [
      {
        key: 'domain',
        label: 'Site URL (e.g. https://pub.fly.pm)',
        validation: `/^https?:\\/\\/(?:www\\.)?[\\w\\-]+(\\.[\\w\\-]+)+([\\/?#][^\\s]*)?$/`,
        type: 'text' as const,
      },
      {
        key: 'apiKey',
        label: 'API Token (EmDash admin → API tokens)',
        validation: `/.+/`,
        type: 'password' as const,
      },
      {
        key: 'collection',
        label: 'Collection slug (default: posts)',
        validation: `/.*/`,
        type: 'text' as const,
      },
    ];
  }

  private decode(code: string): EmdashCreds {
    const parsed = JSON.parse(Buffer.from(code, 'base64').toString()) as {
      domain: string;
      apiKey: string;
      collection?: string;
    };
    return {
      domain: (parsed.domain || '').replace(/\/+$/, ''),
      apiKey: parsed.apiKey,
      collection: (parsed.collection || 'posts').trim() || 'posts',
    };
  }

  /**
   * EmDash content fields store Portable Text blocks, not HTML/markdown. Convert
   * the post body into a minimal block array — one "normal" paragraph block per
   * line. HTML is stripped defensively so an HTML body still degrades cleanly.
   */
  private toPortableText(message?: string) {
    const text = (message || '')
      .replace(/<br\s*\/?>(?:\s*)/gi, '\n')
      .replace(/<\/(?:p|div|h[1-6]|li|ul|ol|blockquote)>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, '"');
    const paragraphs = text
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (paragraphs.length === 0) {
      paragraphs.push('');
    }
    return paragraphs.map((p, i) => ({
      _type: 'block',
      _key: `b${i}`,
      style: 'normal',
      children: [{ _type: 'span', _key: `s${i}`, text: p }],
    }));
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    try {
      const { domain, apiKey } = this.decode(params.code);
      // Validate the token and pull the connected identity. An invalid token
      // makes this.fetch throw (caught below).
      const res = await this.fetch(`${domain}/_emdash/api/auth/me`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const json = (await res.json()) as {
        data?: {
          id?: string;
          name?: string;
          email?: string;
          avatarUrl?: string;
        };
      };
      const user = json?.data;
      if (!user || (!user.id && !user.email)) {
        return 'Invalid credentials';
      }
      const host = domain.replace(/^https?:\/\//, '');
      return {
        refreshToken: '',
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: params.code,
        id: `${domain}_${user.id || 'emdash'}`,
        name: user.name || user.email || host,
        picture: user.avatarUrl || '',
        username: user.email || host,
      };
    } catch (err) {
      return 'Invalid credentials';
    }
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<EmdashDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const { domain, apiKey, collection } = this.decode(accessToken);
    const first = postDetails?.[0];
    const title =
      first?.settings?.title?.trim() ||
      first?.message
        ?.replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) ||
      'Untitled';
    const slug = slugify(title, { lower: true, strict: true, trim: true });
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    const path = `${domain}/_emdash/api/content/${encodeURIComponent(
      collection
    )}`;

    // 1) Create as draft — the create endpoint only accepts status "draft"
    // (omitted here, which defaults to draft). `data` carries the collection's
    // fields; a blog `posts` collection accepts the body as an HTML string.
    const created = (await (
      await this.fetch(path, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          data: { title, content: this.toPortableText(first?.message) },
          slug,
        }),
      })
    ).json()) as {
      success?: boolean;
      data?: { item?: { id?: string; slug?: string } };
    };

    const item = created?.data?.item;
    if (!item?.id) {
      throw new Error(
        `EmDash create failed: ${JSON.stringify(created).slice(0, 300)}`
      );
    }

    // 2) Publish the draft (separate endpoint; empty body = publish now).
    await this.fetch(`${path}/${item.id}/publish`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    return [
      {
        id: first?.id,
        postId: String(item.id),
        releaseURL: `${domain}/${item.slug || slug}`,
        status: 'completed',
      },
    ];
  }
}
