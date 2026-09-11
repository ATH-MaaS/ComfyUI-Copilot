import os
import json
from typing import Dict, Any, Optional
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# 创建数据库基类
Base = declarative_base()

# 定义workflow_version表模型
class WorkflowVersion(Base):
    __tablename__ = 'workflow_version'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(255), nullable=False)
    workflow_data = Column(Text, nullable=False)  # JSON字符串 api格式
    workflow_data_ui = Column(Text, nullable=True)  # JSON字符串 ui格式
    attributes = Column(Text, nullable=True)  # JSON字符串，存储额外属性
    created_at = Column(DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'workflow_data': json.loads(self.workflow_data) if self.workflow_data else None,
            'attributes': json.loads(self.attributes) if self.attributes else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class DatabaseManager:
    """数据库管理器"""
    
    def __init__(self, db_path: str = None):
        if db_path is None:
            # 默认数据库路径
            current_dir = os.path.dirname(os.path.abspath(__file__))
            db_dir = os.path.join(current_dir, '..', 'data')
            os.makedirs(db_dir, exist_ok=True)
            db_path = os.path.join(db_dir, 'workflow_debug.db')
        
        self.db_path = db_path
        self.engine = create_engine(f'sqlite:///{db_path}', echo=False)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        
        # 创建表
        Base.metadata.create_all(bind=self.engine)
        
    def get_session(self):
        """获取数据库会话"""
        return self.SessionLocal()
    
    def save_workflow_version(self, session_id: str, workflow_data: Dict[str, Any], workflow_data_ui: Dict[str, Any] = None, attributes: Optional[Dict[str, Any]] = None) -> int:
        """保存工作流版本，返回新版本的ID"""
        session = self.get_session()
        try:
            workflow_version = WorkflowVersion(
                session_id=session_id,
                workflow_data=json.dumps(workflow_data),
                workflow_data_ui=json.dumps(workflow_data_ui) if workflow_data_ui else None,
                attributes=json.dumps(attributes) if attributes else None
            )
            session.add(workflow_version)
            session.commit()
            session.refresh(workflow_version)
            return workflow_version.id
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def get_current_workflow_data(self, session_id: str) -> Optional[Dict[str, Any]]:
        """获取当前session的最新工作流数据（最大ID版本）"""
        session = self.get_session()
        try:
            latest_version = session.query(WorkflowVersion)\
                .filter(WorkflowVersion.session_id == session_id)\
                .order_by(WorkflowVersion.id.desc())\
                .first()
            
            if latest_version:
                return json.loads(latest_version.workflow_data)
            return None
        finally:
            session.close()
    
    def get_current_workflow_data_ui(self, session_id: str) -> Optional[Dict[str, Any]]:
        """获取当前session的最新工作流数据（最大ID版本）"""
        session = self.get_session()
        try:
            latest_version = session.query(WorkflowVersion)\
                .filter(WorkflowVersion.session_id == session_id)\
                .order_by(WorkflowVersion.id.desc())\
                .first()
            
            if latest_version:
                return json.loads(latest_version.workflow_data_ui)
            return None
        finally:
            session.close() 
    
    def get_workflow_version_by_id(self, version_id: int) -> Optional[Dict[str, Any]]:
        """根据版本ID获取工作流数据"""
        session = self.get_session()
        try:
            version = session.query(WorkflowVersion)\
                .filter(WorkflowVersion.id == version_id)\
                .first()
            
            if version:
                result = version.to_dict()
                # 添加UI格式的工作流数据
                if version.workflow_data_ui:
                    result['workflow_data_ui'] = json.loads(version.workflow_data_ui)
                return result
            return None
        finally:
            session.close()

    def get_workflow_version_by_id_and_session(self, version_id: int, session_id: str) -> Optional[Dict[str, Any]]:
        """根据版本ID和session_id获取工作流数据"""
        session = self.get_session()
        try:
            version = session.query(WorkflowVersion)\
                .filter(WorkflowVersion.id == version_id)\
                .filter(WorkflowVersion.session_id == session_id)\
                .first()

            if version:
                result = version.to_dict()
                if version.workflow_data_ui:
                    result['workflow_data_ui'] = json.loads(version.workflow_data_ui)
                return result
            return None
        finally:
            session.close()
    
    def update_workflow_version(self, version_id: int, workflow_data: Dict[str, Any], attributes: Optional[Dict[str, Any]] = None) -> bool:
        """更新指定版本的工作流数据"""
        session = self.get_session()
        try:
            version = session.query(WorkflowVersion)\
                .filter(WorkflowVersion.id == version_id)\
                .first()
            
            if version:
                version.workflow_data = json.dumps(workflow_data)
                if attributes:
                    version.attributes = json.dumps(attributes)
                session.commit()
                return True
            return False
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def update_workflow_ui(self, version_id: int, workflow_data_ui: Dict[str, Any]) -> bool:
        """只更新指定版本的workflow_data_ui字段，不影响其他字段"""
        session = self.get_session()
        try:
            version = session.query(WorkflowVersion)\
                .filter(WorkflowVersion.id == version_id)\
                .first()
            
            if version:
                version.workflow_data_ui = json.dumps(workflow_data_ui)
                session.commit()
                return True
            return False
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()

    def update_workflow_ui_for_session(self, version_id: int, session_id: str, workflow_data_ui: Dict[str, Any]) -> bool:
        """只更新当前session下指定版本的workflow_data_ui字段"""
        session = self.get_session()
        try:
            version = session.query(WorkflowVersion)\
                .filter(WorkflowVersion.id == version_id)\
                .filter(WorkflowVersion.session_id == session_id)\
                .first()

            if version:
                version.workflow_data_ui = json.dumps(workflow_data_ui)
                session.commit()
                return True
            return False
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()

# 全局数据库管理器实例
db_manager = DatabaseManager()

def get_workflow_data(session_id: str) -> Optional[Dict[str, Any]]:
    """获取当前session的工作流数据的便捷函数"""
    return db_manager.get_current_workflow_data(session_id)

def get_workflow_data_ui(session_id: str) -> Optional[Dict[str, Any]]:
    """获取当前session的工作流数据的便捷函数"""
    return db_manager.get_current_workflow_data_ui(session_id)

def save_workflow_data(session_id: str, workflow_data: Dict[str, Any], workflow_data_ui: Dict[str, Any] = None, attributes: Optional[Dict[str, Any]] = None) -> int:
    """保存工作流数据的便捷函数"""
    return db_manager.save_workflow_version(session_id, workflow_data, workflow_data_ui, attributes)

def get_workflow_data_by_id(version_id: int) -> Optional[Dict[str, Any]]:
    """根据版本ID获取工作流数据的便捷函数"""
    return db_manager.get_workflow_version_by_id(version_id)

def get_workflow_data_by_id_and_session(version_id: int, session_id: str) -> Optional[Dict[str, Any]]:
    """根据版本ID和session_id获取工作流数据的便捷函数"""
    return db_manager.get_workflow_version_by_id_and_session(version_id, session_id)

def update_workflow_ui_by_id(version_id: int, workflow_data_ui: Dict[str, Any]) -> bool:
    """只更新指定版本的workflow_data_ui字段的便捷函数"""
    return db_manager.update_workflow_ui(version_id, workflow_data_ui)

def update_workflow_ui_by_id_and_session(version_id: int, session_id: str, workflow_data_ui: Dict[str, Any]) -> bool:
    """只更新当前session下指定版本的workflow_data_ui字段的便捷函数"""
    return db_manager.update_workflow_ui_for_session(version_id, session_id, workflow_data_ui)
