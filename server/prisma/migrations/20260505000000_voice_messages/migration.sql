ALTER TABLE `ChatMessageMedia`
  MODIFY `type` ENUM('TEXT', 'GIF', 'IMAGE', 'VOICE') NOT NULL;
