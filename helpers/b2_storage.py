import os
from b2sdk.v2 import InMemoryAccountInfo, B2Api
from b2sdk.v2.exception import B2Error
import logging

logger = logging.getLogger(__name__)

class B2Storage:
    """Класс для работы с Backblaze B2"""

    @staticmethod
    def _parse_bool(value) -> bool:
        if value is None:
            return False
        return str(value).strip().lower() in {"true", "1", "yes", "y", "on"}
    
    def __init__(self):
        self.key_id = os.getenv('B2_APPLICATION_KEY_ID')
        self.application_key = os.getenv('B2_APPLICATION_KEY')
        self.bucket_name = os.getenv('B2_BUCKET_NAME')
        self.enabled = self._parse_bool(os.getenv('B2_ENABLED', 'false'))
        
        self.api = None
        self.bucket = None
        
        if self.enabled:
            if not self.key_id or not self.application_key or not self.bucket_name:
                logger.warning(
                    "B2 Storage enabled by B2_ENABLED, but credentials/bucket are missing: "
                    "key_id=%s application_key=%s bucket_name=%s",
                    bool(self.key_id),
                    bool(self.application_key),
                    bool(self.bucket_name),
                )
                self.enabled = False
            else:
                self._initialize()
        else:
            logger.info("B2 Storage disabled (B2_ENABLED is not truthy)")
    
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
            if self.enabled and not self.bucket:
                logger.error("B2 Storage is enabled but bucket is not initialized; cannot upload %s", remote_path)
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
    
    def _is_not_found_error(self, exc: Exception) -> bool:
        status = getattr(exc, 'status', None)
        if status == 404:
            return True
        code = getattr(exc, 'code', None)
        if code and str(code).strip().lower() in {
            'not_found',
            'file_not_present',
            'file_not_present_error',
            'no_such_file',
            'notfound',
        }:
            return True
        msg = str(exc).lower()
        if 'not found' in msg or 'no such file' in msg or 'file not present' in msg:
            return True
        return False


    def file_exists(self, remote_path, raise_on_error: bool = False):
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
        except B2Error as e:
            if self._is_not_found_error(e):
                return False
            logger.error("B2 file_exists error for %s: %s", remote_path, e, exc_info=True)
            if raise_on_error:
                raise
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

    def list_files(self, path_prefix: str = ""):
        """Возвращает список файлов в B2, начинающихся с prefix."""
        if not self.enabled or not self.bucket:
            return []
        prefix = str(path_prefix or "")
        out = []
        try:
            for file_version, folder_name in self.bucket.ls(folder_to_list=prefix, recursive=True):
                try:
                    name = getattr(file_version, 'file_name', None) or getattr(file_version, 'fileName', None)
                    if not name:
                        continue
                    if prefix and not str(name).startswith(prefix):
                        continue
                    out.append(str(name))
                except Exception:
                    continue
        except B2Error as e:
            logger.error("B2 list_files failed for %s: %s", prefix, e, exc_info=True)
            return []
        except Exception as e:
            logger.error("B2 list_files unexpected error for %s: %s", prefix, e, exc_info=True)
            return []
        return out

    def delete_prefix(self, path_prefix: str = ""):
        """Удаляет все версии файлов в B2 с данным prefix. Возвращает количество удалённых.

        В B2 у файла могут быть версии (UI показывает "(2)", "(3)").
        delete_file() через get_file_info_by_name удаляет только текущую версию.
        Поэтому здесь мы удаляем КАЖДУЮ версию, возвращаемую bucket.ls().
        """
        if not self.enabled or not self.bucket:
            return 0

        prefix = str(path_prefix or "")
        deleted = 0
        try:
            for file_version, folder_name in self.bucket.ls(folder_to_list=prefix, recursive=True):
                try:
                    if not file_version:
                        continue
                    name = getattr(file_version, 'file_name', None) or getattr(file_version, 'fileName', None)
                    if not name:
                        continue
                    if prefix and not str(name).startswith(prefix):
                        continue
                    # Delete this exact version.
                    file_version.delete()
                    deleted += 1
                except B2Error as e:
                    logger.error("Failed to delete B2 file version under prefix %s: %s", prefix, e, exc_info=True)
                    continue
                except Exception as e:
                    logger.error("Unexpected error deleting B2 file version under prefix %s: %s", prefix, e, exc_info=True)
                    continue
        except B2Error as e:
            logger.error("B2 delete_prefix ls failed for %s: %s", prefix, e, exc_info=True)
            return deleted
        except Exception as e:
            logger.error("B2 delete_prefix unexpected ls error for %s: %s", prefix, e, exc_info=True)
            return deleted

        return deleted

# Глобальный экземпляр
b2_storage = B2Storage()

