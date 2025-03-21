from app import db

class Student(db.Model):
    __tablename__ = 'students'
    id = db.Column(db.Integer, primary_key=True)
    fio = db.Column(db.String(255), nullable=False)
    mail = db.Column(db.String(255), nullable=False)
    photo_path = db.Column(db.String(255), nullable=False)
    birth_date = db.Column(db.Date, nullable=False)
    education_form = db.Column(db.String(40), nullable=False)
    face_encoding = db.Column(db.Text)
    id_group = db.Column(db.Integer, db.ForeignKey('groups.id', ondelete='CASCADE'), nullable=False)
    group = db.relationship('Group', backref=db.backref('students', cascade='all, delete-orphan'))