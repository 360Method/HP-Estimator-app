CREATE TABLE `phoneSettings` (
	`id` int NOT NULL DEFAULT 1,
	`forwardingMode` enum('forward_to_number','forward_to_ai','voicemail') NOT NULL DEFAULT 'forward_to_number',
	`forwardingNumber` varchar(20) DEFAULT '',
	`aiServiceNumber` varchar(20) DEFAULT '',
	`greeting` varchar(500) DEFAULT '',
	`callRecording` boolean NOT NULL DEFAULT false,
	`transcribeVoicemail` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `phoneSettings_id` PRIMARY KEY(`id`)
);
