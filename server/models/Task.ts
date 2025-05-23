import { DataTypes, Model, Sequelize } from 'sequelize';
import { Document } from './Document';
import { User } from './User';
import { TaskComment } from './TaskComment';

export class Task extends Model {
  public id!: string;
  public guid!: string;
  public documentId!: string;
  public userId?: string | null;
  public title!: string;
  public body?: string | null;
  public status!: string;
  public priority!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public static associate(models: any) {
    this.belongsTo(models.Document, {
      foreignKey: 'documentId',
      as: 'document',
    });
    this.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'assignee',
    });
    this.hasMany(models.TaskComment, {
      foreignKey: 'taskId',
      as: 'comments',
    });
  }
}

export default function initTaskModel(sequelize: Sequelize): typeof Task {
  Task.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      guid: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: 'documentGuid', 
      },
      documentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'documents',
          key: 'id',
        },
        unique: 'documentGuid',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      title: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'open',
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      modelName: 'Task',
      tableName: 'tasks',
      indexes: [
        { fields: ['guid'] },
        { fields: ['documentId'] },
        { fields: ['userId'] },
        { fields: ['status'] },
      ],
    }
  );
  return Task;
}
