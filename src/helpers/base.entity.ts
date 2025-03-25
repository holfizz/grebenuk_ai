import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";
import { IsDate, IsUUID } from "class-validator";

@ObjectType()
export class BaseEntity {
  @Field(() => ID)
  @IsUUID()
  id: string;

  @Field(() => GraphQLISODateTime)
  @IsDate()
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  @IsDate()
  updatedAt: Date;
}
