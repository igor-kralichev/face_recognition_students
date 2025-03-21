from app import db

class Teacher(db.Model):
    __tablename__ = 'teachers'
    id = db.Column(db.Integer, primary_key=True)
    id_user = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    id_lesson = db.Column(db.Integer, db.ForeignKey('lessons.id', ondelete='CASCADE'), nullable=False)
    user = db.relationship('User', backref=db.backref('teachers', cascade='all, delete-orphan'))
    lesson = db.relationship('Lesson', backref=db.backref('teachers', cascade='all, delete-orphan'))
    __table_args__ = (db.UniqueConstraint('id_user', 'id_lesson', name='unique_teacher_lesson'),)