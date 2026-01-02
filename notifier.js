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
        android_channel_id: 'f169184d-40f6-4825-b557-64976726f094', // ✅ الـ ID الصحيح
        included_segments: ['All'],
        headings: { en: 'نجاح جديد' },
        contents: { en: projectId }
      })
    });
    
    const data = await response.json();
    
    if (data.errors) {
      console.error('❌ خطأ من OneSignal:', data.errors);
      return null;
    }
    
    console.log('✅ تم إرسال الإشعار:', projectId);
    console.log('📱 عدد المستلمين:', data.recipients || 0);
    
    return data;
  } catch (error) {
    console.error('❌ خطأ في إرسال الإشعار:', error.message);
    return null;
  }
}

async function checkFirestore() {
  try {
    console.log('🔍 جاري فحص Firestore...');
    
    // الحصول على جميع Collections
    const collections = await db.listCollections();
    
    for (const collectionRef of collections) {
      console.log(`📂 فحص Collection: ${collectionRef.id}`);
      
      // استعلام بسيط: فقط status = "success"
      const snapshot = await collectionRef
        .where('status', '==', 'success')
        .get();
      
      if (snapshot.empty) {
        console.log(`   لا توجد مستندات في ${collectionRef.id}`);
        continue;
      }
      
      // فلترة المستندات يدوياً
      for (const doc of snapshot.docs) {
        const data = doc.data();
        
        // تحقق: هل تم إرسال الإشعار مسبقاً؟
        if (data.notificationSent === true) {
          console.log(`   تخطي المستند ${doc.id} - تم إرسال الإشعار مسبقاً`);
          continue;
        }
        
        const projectId = data.project_id;
        
        if (projectId) {
          console.log(`📤 إرسال إشعار للمشروع: ${projectId}`);
          
          // إرسال الإشعار
          const result = await sendNotification(String(projectId));
          
          // تحديث المستند فقط إذا نجح الإرسال
          if (result && !result.errors) {
            await doc.ref.update({ notificationSent: true });
            console.log(`✅ تم تحديث المستند: ${doc.id}`);
          } else {
            console.log(`⚠️ فشل إرسال الإشعار للمستند: ${doc.id}`);
          }
          
          // انتظر قليلاً بين الإشعارات
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    console.log('✨ انتهى الفحص بنجاح');
  } catch (error) {
    console.error('❌ خطأ في checkFirestore:', error.message);
    console.error(error.stack);
  }
}

// تشغيل الفحص
checkFirestore().then(() => {
  console.log('تم الانتهاء من التنفيذ');
  process.exit(0);
}).catch((error) => {
  console.error('خطأ غير متوقع:', error);
  process.exit(1);
});
