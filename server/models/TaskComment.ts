import { DataTypes, Model, Sequelize } from 'sequelize';
import { Task } from './Task';
import { User } from './User';

export class TaskComment extends Model {
  public id!: string;
  public taskId!: string;
  public userId!: string;
  public content!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public static associate(models: any) {
    this.belongsTo(models.Task, {
      foreignKey: 'taskId',
      as: 'task',
    });
    this.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });
  }
}

export default function initTaskCommentModel(
  sequelize: Sequelize
): typeof TaskComment {
  TaskComment.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      taskId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'tasks',
          key: 'id',
        },
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'TaskComment',
      tableName: 'task_comments',
      indexes: [{ fields: ['taskId'] }, { fields: ['userId'] }],
    }
  );
  return TaskComment;
}
