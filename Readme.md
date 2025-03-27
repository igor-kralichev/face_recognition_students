Before the first launch, create .the env file. 
Write the following in it:
-------------------------------------------------------------
# Setting up Flask
FLASK_APP=app
FLASK_ENV=production
FLASK_DEBUG=1


# Secret key
SECRET_KEY='Insert_Your_secrete_key'

# JWT Secret key
JWT_SECRET_KEY='Insert_Your_JWT_secrete_key'

# Settings for connecting to postgres
DB_HOST=localhost
DB_NAME='Your_ Database'
DB_USER='Your_login'
DB_PASSWORD='Password_Your_ Database'
DB_PORT=5432#Default for postgres


# Configuration for SMTP mail
MAIL_HOST=
MAIL_PORT=
MAIL_USERNAME=
MAIL_FROM=
MAIL_PASSWORD=
-------------------------------------------------------------

After that, you can start the server. The launch is performed via run.py .
The code was tested on PyCharm.
