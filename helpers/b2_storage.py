import os
from b2sdk.v2 import InMemoryAccountInfo, B2Api
from b2sdk.v2.exception import B2Error
import logging

logger = logging.getLogger(__name__)

class B2Storage:
    """Класс для работы с Backblaze B2"""
    
    def __init__(self):
        self.key_id = os.getenv('B2_APPLICATION_KEY_ID')
        self.application_key = os.getenv('B2_APPLICATION_KEY')
        self.bucket_name = os.getenv('B2_BUCKET_NAME')
        self.enabled = os.getenv('B2_ENABLED', 'false').lower() == 'true'
        
        self.api = None
        self.bucket = None
        
        if self.enabled and self.key_id and self.application_key:
            self._initialize()
    
    def _initialize(self):
        """Инициализация подключения к B2"""
        try:
            info = InMemoryAccountInfo()
            self.api = B2Api(info)
            self.api.authorize_account("production", self.key_id, self.application_key)
            self.bucket = self.api.get_bucket_by_name(self.bucket_name)
            logger.info(f"B2 Storage initialized: bucket={self.bucket_name}")
        except B2Error as e:
            logger.error(f"Failed to initialize B2 Storage: {e}")
            self.enabled = False
    
    def upload_file(self, local_path, remote_path):
        """
        Загружает файл в B2
        
        Args:
            local_path: Путь к локальному файлу
            remote_path: Путь в B2 (например, 'audio/dictation_123.mp3')
        
        Returns:
            URL файла или None при ошибке
        """
        if not self.enabled or not self.bucket:
            return None
        
        try:
            file_info = self.bucket.upload_local_file(
                local_file=local_path,
                file_name=remote_path
            )
            
            # Получаем публичный URL
            download_url = self.bucket.get_download_url(file_info.file_name)
            logger.info(f"File uploaded to B2: {remote_path}")
            return download_url
        except B2Error as e:
            logger.error(f"Failed to upload file to B2: {e}")
            return None
    
    def delete_file(self, remote_path):
        """
        Удаляет файл из B2
        
        Args:
            remote_path: Путь к файлу в B2
        """
        if not self.enabled or not self.bucket:
            return False
        
        try:
            file_info = self.bucket.get_file_info_by_name(remote_path)
            file_info.delete()
            logger.info(f"File deleted from B2: {remote_path}")
            return True
        except B2Error as e:
            logger.error(f"Failed to delete file from B2: {e}")
            return False
    
    def file_exists(self, remote_path):
        """
        Проверяет, существует ли файл в B2
        
        Args:
            remote_path: Путь к файлу в B2
        
        Returns:
            True если файл существует, False иначе
        """
        if not self.enabled or not self.bucket:
            return False
        
        try:
            self.bucket.get_file_info_by_name(remote_path)
            return True
        except B2Error:
            return False
    
    def get_download_url(self, remote_path, valid_duration_seconds=3600):
        """
        Получает временную публичную ссылку на файл
        
        Args:
            remote_path: Путь к файлу в B2
            valid_duration_seconds: Время жизни ссылки в секундах (по умолчанию 1 час)
        
        Returns:
            URL или None
        """
        if not self.enabled or not self.bucket:
            return None
        
        try:
            download_url = self.bucket.get_download_url(remote_path)
            return download_url
        except B2Error as e:
            logger.error(f"Failed to get download URL: {e}")
            return None
    
    def download_file(self, remote_path, local_path):
        """
        Скачивает файл из B2 в локальную папку.
        Использует b2sdk API (как upload) - должно работать на хостинге.
        
        Args:
            remote_path: Путь к файлу в B2
            local_path: Локальный путь для сохранения
        
        Returns:
            True если успешно, False иначе
        """
        if not self.enabled or not self.bucket:
            return False
        
        try:
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            downloaded_file = self.bucket.download_file_by_name(file_name=remote_path)
            downloaded_file.save_to(local_path)
            
            if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
                return True
            return False
        except B2Error:
            return False
        except Exception:
            return False

# Глобальный экземпляр
b2_storage = B2Storage()

