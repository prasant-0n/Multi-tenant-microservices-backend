import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { TenantsService } from './tenants.service';
import { Tenant } from './tenant.entity';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  name: string;
}

class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  create(@Body() dto: CreateTenantDto): Promise<Tenant> {
    return this.tenants.create(dto.name);
  }

  @Get()
  list(@Query() query: ListQueryDto): Promise<Tenant[]> {
    return this.tenants.findAll({ limit: query.limit, offset: query.offset });
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Tenant> {
    return this.tenants.findOne(id);
  }

  @Post(':id/token')
  @HttpCode(200)
  token(@Param('id') id: string): Promise<{ accessToken: string }> {
    return this.tenants.issueToken(id);
  }
}
