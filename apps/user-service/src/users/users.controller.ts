import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { TenantParam, TenantContextGuard, type CurrentTenant } from '@app/tenancy';
import { UsersService, type User } from './users.service';

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEmail()
  email: string;
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

@Controller('users')
@UseGuards(TenantContextGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto, @TenantParam() tenant: CurrentTenant): Promise<User> {
    return this.users.create(tenant.schema, tenant.tenantId, dto.name, dto.email);
  }

  @Get()
  list(@Query() query: ListQueryDto, @TenantParam() tenant: CurrentTenant): Promise<User[]> {
    return this.users.findAll(tenant.schema, query.limit, query.offset);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @TenantParam() tenant: CurrentTenant): Promise<User> {
    const user = await this.users.findById(tenant.schema, id);
    if (!user) {
      throw new NotFoundException(`user ${id} not found`);
    }
    return user;
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @TenantParam() tenant: CurrentTenant): Promise<void> {
    const removed = await this.users.remove(tenant.schema, id);
    if (!removed) {
      throw new NotFoundException(`user ${id} not found`);
    }
  }
}
