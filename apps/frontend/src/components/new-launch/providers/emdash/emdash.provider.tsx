'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { Input } from '@gitroom/react/form/input';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { EmdashDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/emdash.dto';

const EmdashSettings: FC = () => {
  const form = useSettings();
  return (
    <>
      <Input label="Title" {...form.register('title')} />
    </>
  );
};

export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: EmdashSettings,
  CustomPreviewComponent: undefined,
  dto: EmdashDto,
  maximumCharacters: 100000,
});
