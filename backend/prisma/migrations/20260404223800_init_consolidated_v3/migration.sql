-- CreateTable
CREATE TABLE `message` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `text` TEXT NOT NULL,
    `senderId` INTEGER NOT NULL,
    `ticketId` INTEGER NULL,
    `poId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `message_senderId_idx`(`senderId`),
    INDEX `message_ticketId_idx`(`ticketId`),
    INDEX `message_poId_idx`(`poId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `message` ADD CONSTRAINT `message_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message` ADD CONSTRAINT `message_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `ticket`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message` ADD CONSTRAINT `message_poId_fkey` FOREIGN KEY (`poId`) REFERENCES `purchase_order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
