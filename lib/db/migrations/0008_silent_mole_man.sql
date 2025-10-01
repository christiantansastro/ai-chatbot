CREATE TABLE IF NOT EXISTS "Client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_name" varchar(255) NOT NULL,
	"date_intake" date,
	"date_of_birth" date,
	"address" text,
	"phone" varchar(50),
	"email" varchar(255),
	"contact_1" varchar(255),
	"relationship_1" varchar(255),
	"contact_2" varchar(255),
	"relationship_2" varchar(255),
	"notes" text,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL
);
