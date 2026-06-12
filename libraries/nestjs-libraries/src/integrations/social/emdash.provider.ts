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
  editor = 'html' as const;
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

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    try {
      const { domain, apiKey } = this.decode(params.code);
      // Validate the token + reachability with a read the token is allowed to
      // do (listing the site's collections). 401/invalid -> this.fetch throws
      // or returns success:false.
      const res = await this.fetch(`${domain}/_emdash/api/schema/collections`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const json = (await res.json()) as { success?: boolean };
      if (json?.success === false) {
        return 'Invalid credentials';
      }
      const host = domain.replace(/^https?:\/\//, '');
      return {
        refreshToken: '',
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: params.code,
        id: domain,
        name: host,
        picture: '',
        username: host,
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
          data: { title, content: first?.message || '' },
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
