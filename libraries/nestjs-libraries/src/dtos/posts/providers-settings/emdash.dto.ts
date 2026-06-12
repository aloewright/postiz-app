import { IsOptional, IsString } from 'class-validator';

export class EmdashDto {
  // Blog post title. Optional at the DTO layer so a missing title doesn't hard
  // -fail validation; the provider derives a fallback from the body when empty.
  @IsOptional()
  @IsString()
  title?: string;
}
