const admin = require('firebase-admin');
const fetch = require('node-fetch');

// تهيئة Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

async function sendNotification(projectId) {
  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_API_KEY}`
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        included_segments: ['All'],
        headings: { en: 'نجاح جديد' },
        contents: { en: projectId }
      })
    });
    
    const data = await response.json();
    console.log('✅ تم إرسال الإشعار:', projectId);
    return data;
  } catch (error) {
    console.error('❌ خطأ في إرسال الإشعار:', error);
    throw error;
  }
}

async function checkFirestore() {
  try {
    console.log('🔍 جاري فحص Firestore...');
    
    // الحصول على جميع Collections
    const collections = await db.listCollections();
    
    for (const collectionRef of collections) {
      console.log(`📂 فحص Collection: ${collectionRef.id}`);
      
      // البحث عن المستندات التي status = "success" و notificationSent ليس true
      const snapshot = await collectionRef
        .where('status', '==', 'success')
        .where('notificationSent', '!=', true)
        .get();
      
      if (snapshot.empty) {
        console.log(`   لا توجد مستندات جديدة في ${collectionRef.id}`);
        continue;
      }
      
      // معالجة كل مستند
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const projectId = data.project_id;
        
        if (projectId) {
          console.log(`📤 إرسال إشعار للمشروع: ${projectId}`);
          
          // إرسال الإشعار
          await sendNotification(String(projectId));
          
          // تحديث المستند
          await doc.ref.update({ notificationSent: true });
          console.log(`✅ تم تحديث المستند: ${doc.id}`);
        }
      }
    }
    
    console.log('✨ انتهى الفحص بنجاح');
  } catch (error) {
    console.error('❌ خطأ في checkFirestore:', error);
  }
}

// تشغيل الفحص
checkFirestore().then(() => {
  console.log('تم الانتهاء من التنفيذ');
  process.exit(0);
});
